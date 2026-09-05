"use strict";

function assertSaveFlushResult(result) {
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    Object.keys(result).length !== 2 ||
    !Number.isSafeInteger(result.requestId) ||
    result.requestId <= 0 ||
    (result.status !== "saved" && result.status !== "failed")
  ) {
    throw new TypeError("Invalid save flush result");
  }
  return { requestId: result.requestId, status: result.status };
}

/** A deadline offers recovery; only a successful save or explicit discard quits. */
function createQuitSaveController({
  sendFlush,
  showRecoveryPrompt,
  finishQuit,
  onPromptError = () => {},
  timeoutMs = 10_000,
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  let state = "idle";
  let requestId = 0;
  let timer = null;

  function clearTimer() {
    if (timer !== null) cancel(timer);
    timer = null;
  }

  function finish() {
    clearTimer();
    state = "done";
    finishQuit();
  }

  function recover(reason) {
    if (state !== "waiting") return;
    clearTimer();
    state = "prompting";
    const promptRequestId = requestId;
    Promise.resolve()
      .then(() => showRecoveryPrompt(reason))
      .then((choice) => {
        if (state !== "prompting" || requestId !== promptRequestId) return;
        if (choice === "discard") {
          finish();
        } else {
          state = "idle";
          // A fresh request captures changes made after a slow save began.
          // Late acknowledgements cannot close a later attempt or a canceled quit.
          if (choice === "retry") request();
        }
      })
      .catch((error) => {
        if (state === "prompting" && requestId === promptRequestId) state = "idle";
        onPromptError(error);
      });
  }

  function request() {
    if (state !== "idle") return;
    state = "waiting";
    requestId += 1;
    timer = schedule(() => recover("slow"), timeoutMs);
    try {
      sendFlush(requestId);
    } catch {
      recover("unavailable");
    }
  }

  function receive(rawResult) {
    const result = assertSaveFlushResult(rawResult);
    if (result.requestId !== requestId || state !== "waiting") return false;
    if (result.status === "saved") finish();
    else recover("failed");
    return true;
  }

  return {
    getState: () => state,
    request,
    receive,
    rendererUnavailable: () => recover("unavailable"),
  };
}

module.exports = { assertSaveFlushResult, createQuitSaveController };
