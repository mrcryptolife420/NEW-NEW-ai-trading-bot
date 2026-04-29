import {
  createBotLifecycleState,
  setBotLifecycleActivity,
  transitionBotLifecycle
} from "../src/runtime/botLifecycleStateMachine.js";

export async function registerBotLifecycleTests({ runCheck, assert }) {
  await runCheck("bot lifecycle allows guarded happy-path transitions", async () => {
    let lifecycle = createBotLifecycleState();
    lifecycle = transitionBotLifecycle(lifecycle, "initializing", { activity: "refreshing", reason: "boot" });
    lifecycle = transitionBotLifecycle(lifecycle, "ready", { activity: "idle", reason: "init_complete" });
    lifecycle = transitionBotLifecycle(lifecycle, "running", { activity: "cycle", reason: "start" });
    lifecycle = transitionBotLifecycle(lifecycle, "stopping", { activity: "idle", reason: "stop" });
    lifecycle = transitionBotLifecycle(lifecycle, "stopped", { activity: "idle", reason: "stopped" });
    assert.equal(lifecycle.state, "stopped");
    assert.equal(lifecycle.history[0].to, "stopped");
    assert.equal(lifecycle.history.at(-1).from, "created");
  });

  await runCheck("bot lifecycle rejects invalid transitions", async () => {
    const lifecycle = transitionBotLifecycle(
      transitionBotLifecycle(
        transitionBotLifecycle(createBotLifecycleState(), "initializing"),
        "ready"
      ),
      "running"
    );
    assert.throws(
      () => transitionBotLifecycle(lifecycle, "ready"),
      (error) => error?.code === "INVALID_BOT_LIFECYCLE_TRANSITION"
    );
  });

  await runCheck("bot lifecycle supports degraded recovery and explicit activities", async () => {
    let lifecycle = createBotLifecycleState();
    lifecycle = transitionBotLifecycle(lifecycle, "initializing");
    lifecycle = transitionBotLifecycle(lifecycle, "degraded", { activity: "cycle", reason: "failure" });
    lifecycle = setBotLifecycleActivity(lifecycle, "doctor");
    lifecycle = transitionBotLifecycle(lifecycle, "ready", { activity: "idle", reason: "recovered" });
    assert.equal(lifecycle.state, "ready");
    assert.equal(lifecycle.activity, "idle");
    assert.equal(lifecycle.previousState, "degraded");
  });
}
