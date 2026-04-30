export class PersistenceCoordinator {
  constructor({ store, afterPersist = null }) {
    this.store = store;
    this.afterPersist = typeof afterPersist === "function" ? afterPersist : null;
    this.persistPromise = null;
  }

  notifyAfterPersist(payload) {
    if (!this.afterPersist) {
      return;
    }
    try {
      Promise.resolve(this.afterPersist(payload)).catch(() => {});
    } catch {
      // Persistence must not fail because a non-critical read-model hook failed.
    }
  }

  async enqueue(work) {
    const chainedPersist = (this.persistPromise || Promise.resolve())
      .catch(() => {})
      .then(() => work());
    this.persistPromise = chainedPersist;
    try {
      return await chainedPersist;
    } finally {
      if (this.persistPromise === chainedPersist) {
        this.persistPromise = null;
      }
    }
  }

  async persistSnapshotBundle({ runtime, journal = null, model = null, modelBackups = null }) {
    return this.enqueue(async () => {
      if (typeof this.store.saveSnapshotBundle === "function") {
        await this.store.saveSnapshotBundle({
          runtime,
          journal,
          model,
          modelBackups
        });
        this.notifyAfterPersist({ type: "snapshot_bundle", runtime, journal, model, modelBackups });
        return;
      }
      await this.store.saveRuntime(runtime);
      if (journal != null && typeof this.store.saveJournal === "function") {
        await this.store.saveJournal(journal);
      }
      if (model != null && typeof this.store.saveModel === "function") {
        await this.store.saveModel(model);
      }
      if (modelBackups != null && typeof this.store.saveModelBackups === "function") {
        await this.store.saveModelBackups(modelBackups);
      }
      this.notifyAfterPersist({ type: "snapshot_bundle", runtime, journal, model, modelBackups });
    });
  }

  async persistRuntimeOnly(runtime) {
    return this.enqueue(async () => {
      await this.store.saveRuntime(runtime);
    });
  }

  async persistRuntimeAndBuildSnapshot(runtime, getSnapshot) {
    await this.persistRuntimeOnly(runtime);
    return typeof getSnapshot === "function" ? getSnapshot() : null;
  }
}
