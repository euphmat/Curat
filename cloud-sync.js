import { firebaseConfig } from "./firebase-config.js";

const FIREBASE_SDK_VERSION = "12.16.0";
const REQUIRED_CONFIG_KEYS = [
  "apiKey",
  "authDomain",
  "databaseURL",
  "projectId",
  "appId",
];

function hasFirebaseConfig() {
  return REQUIRED_CONFIG_KEYS.every((key) => String(firebaseConfig[key] || "").trim());
}

function cloneForFirebase(value) {
  return JSON.parse(JSON.stringify(value));
}

function friendlyAuthError(error) {
  const messages = {
    "auth/invalid-credential": "メールアドレスまたはパスワードが違います。",
    "auth/invalid-email": "メールアドレスの形式を確認してください。",
    "auth/missing-password": "パスワードを入力してください。",
    "auth/too-many-requests": "ログイン試行が多すぎます。しばらく待ってから再試行してください。",
    "auth/network-request-failed": "ネットワークに接続できませんでした。",
    "auth/unauthorized-domain": "この GitHub Pages のドメインが Firebase で許可されていません。",
  };
  return messages[error?.code] || error?.message || "Firebase へ接続できませんでした。";
}

export class CloudSync {
  constructor({ getLocalData, onRemoteData, onStatus }) {
    this.getLocalData = getLocalData;
    this.onRemoteData = onRemoteData;
    this.onStatus = onStatus;
    this.configured = hasFirebaseConfig();
    this.user = null;
    this.auth = null;
    this.database = null;
    this.dataRef = null;
    this.unsubscribeData = null;
    this.pendingData = null;
    this.pendingRevision = 0;
    this.changeRevision = 0;
    this.syncedRevision = 0;
    this.uploadTimer = null;
    this.uploadChain = Promise.resolve();
    this.lastAppliedCloudTime = 0;
    this.originId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    this.modules = null;
    this.state = {
      configured: this.configured,
      phase: this.configured ? "loading" : "not-configured",
      email: "",
      lastSyncedAt: "",
      error: "",
    };
  }

  emit(patch = {}) {
    this.state = { ...this.state, ...patch };
    this.onStatus?.({ ...this.state });
  }

  emitSettled(patch = {}) {
    const hasPendingChanges = this.syncedRevision < this.changeRevision;
    this.emit({
      phase: hasPendingChanges ? "syncing" : "synced",
      lastSyncedAt: hasPendingChanges ? this.state.lastSyncedAt : new Date().toISOString(),
      error: "",
      ...patch,
    });
  }

  async start() {
    if (!this.configured) {
      this.emit();
      return;
    }

    try {
      const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
      const [appModule, authModule, databaseModule] = await Promise.all([
        import(`${base}/firebase-app.js`),
        import(`${base}/firebase-auth.js`),
        import(`${base}/firebase-database.js`),
      ]);
      this.modules = { ...appModule, ...authModule, ...databaseModule };
      const app = appModule.initializeApp(firebaseConfig);
      this.auth = authModule.initializeAuth(app, {
        persistence: authModule.browserLocalPersistence,
      });
      this.database = databaseModule.getDatabase(app);
      authModule.onAuthStateChanged(this.auth, (user) => {
        this.handleAuthState(user).catch((error) => this.fail(error));
      });
    } catch (error) {
      this.fail(error);
    }
  }

  async handleAuthState(user) {
    this.unsubscribeData?.();
    this.unsubscribeData = null;
    this.user = user;
    this.dataRef = null;

    if (!user) {
      this.emit({ phase: "signed-out", email: "", error: "" });
      return;
    }

    const { ref, get, onValue } = this.modules;
    this.dataRef = ref(this.database, `curat/${user.uid}`);
    this.emit({ phase: "connecting", email: user.email || "", error: "" });

    const snapshot = await get(this.dataRef);
    const cloudPayload = snapshot.val();
    const localData = this.getLocalData();
    const localRevision = this.changeRevision;

    if (cloudPayload?.data) {
      const cloudUpdated = Date.parse(cloudPayload.data.updatedAt || 0) || 0;
      const localUpdated = Date.parse(localData?.updatedAt || 0) || 0;
      const cloudHasContent =
        Boolean(cloudPayload.data.series?.length) ||
        Boolean(cloudPayload.data.projects?.length);
      const localHasContent =
        Boolean(localData?.series?.length) || Boolean(localData?.projects?.length);
      this.lastAppliedCloudTime = Number(cloudPayload.cloudUpdatedAt) || 0;
      if (cloudUpdated > localUpdated || (!localHasContent && cloudHasContent)) {
        this.applyRemotePayload(cloudPayload, true);
      } else if (localUpdated > cloudUpdated || (localHasContent && !cloudHasContent)) {
        await this.upload(localData, localRevision);
      }
    } else {
      await this.upload(localData, localRevision);
    }

    this.unsubscribeData = onValue(
      this.dataRef,
      (nextSnapshot) => this.applyRemotePayload(nextSnapshot.val(), false),
      (error) => this.fail(error),
    );
    this.emitSettled({
      email: user.email || "",
    });
  }

  applyRemotePayload(payload, initial) {
    if (!payload?.data) return;
    const cloudTime = Number(payload.cloudUpdatedAt) || 0;
    const fromThisSession = payload.originId === this.originId;
    if (!initial && (fromThisSession || cloudTime <= this.lastAppliedCloudTime)) return;

    this.lastAppliedCloudTime = Math.max(this.lastAppliedCloudTime, cloudTime);
    const localUpdated = Date.parse(this.getLocalData()?.updatedAt || 0) || 0;
    const remoteUpdated = Date.parse(payload.data.updatedAt || 0) || 0;
    if (remoteUpdated >= localUpdated) {
      this.onRemoteData(cloneForFirebase(payload.data));
    }
    this.emitSettled();
  }

  queue(data) {
    this.changeRevision += 1;
    this.pendingData = cloneForFirebase(data);
    this.pendingRevision = this.changeRevision;
    if (!this.user || !this.dataRef) return;
    clearTimeout(this.uploadTimer);
    this.emit({ phase: "syncing", error: "" });
    this.uploadTimer = setTimeout(() => {
      const pending = this.pendingData;
      const revision = this.pendingRevision;
      if (!pending) return;
      this.pendingData = null;
      this.upload(pending, revision).catch((error) => this.fail(error));
    }, 500);
  }

  async upload(data, revision = this.changeRevision) {
    if (!this.user || !this.dataRef || !data) return false;
    const snapshot = cloneForFirebase(data);
    const operation = this.uploadChain.catch(() => {}).then(async () => {
      const { set, serverTimestamp } = this.modules;
      this.emit({ phase: "syncing", error: "" });
      await set(this.dataRef, {
        app: "CURAT",
        version: Number(snapshot.version) || 1,
        originId: this.originId,
        cloudUpdatedAt: serverTimestamp(),
        data: snapshot,
      });
      this.syncedRevision = Math.max(this.syncedRevision, revision);
      if (this.pendingData && this.pendingRevision <= revision) {
        this.pendingData = null;
      }
      this.emitSettled({ email: this.user.email || "" });
      return true;
    });
    this.uploadChain = operation;
    return operation;
  }

  async signIn(email, password) {
    if (!this.configured) throw new Error("先に firebase-config.js を設定してください。");
    if (!this.auth || !this.modules) throw new Error("Firebase の読み込みが完了していません。");
    this.emit({ phase: "connecting", error: "" });
    try {
      await this.modules.signInWithEmailAndPassword(this.auth, email, password);
    } catch (error) {
      this.fail(error);
      throw new Error(friendlyAuthError(error));
    }
  }

  async signOut() {
    if (this.auth && this.modules) await this.modules.signOut(this.auth);
  }

  fail(error) {
    const message = friendlyAuthError(error);
    console.warn("クラウド同期に失敗しました", error);
    this.emit({ phase: "error", error: message });
  }
}
