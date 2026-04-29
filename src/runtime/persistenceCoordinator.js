export class PersistenceCoordinator {
  constructor({ store }) {
    this.store = store;
    this.persistPromise = null;
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
