(function attachListenNavigation(windowObj) {
  function isEditableTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const tagName = target.tagName;
    if (target.isContentEditable) {
      return true;
    }
    return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
  }

  function resolveListenNavigationAction(context) {
    if (!context || !context.isListenMode || !context.sessionStarted || context.isFinished || !context.currentWord) {
      return null;
    }

    if (context.eventType === "keydown") {
      if (isEditableTarget(context.target)) {
        return null;
      }
      switch (context.key) {
        case "ArrowUp":
          return "repeat";
        case "ArrowLeft":
          return "previous";
        case "ArrowRight":
          return "next";
        default:
          return null;
      }
    }

    return null;
  }

  windowObj.listenNavigation = {
    resolveListenNavigationAction,
  };
})(window);
