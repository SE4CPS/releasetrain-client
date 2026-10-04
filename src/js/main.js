// main.js: start-up code. Runs last, after every other script has defined its functions.

if (askGuardrailsDetailsEl && askGuardrailsDetailsEl.open) askLoadGuardrails();

    boot().then(async () => {
      refreshActivityChartLlmLine(); // STATE.rawVersions is populated now — repaint the LLM line for real
      refreshActivityChartHvLine();
      const view = new URL(location.href).searchParams.get("view");
      if (view === "graph") {
        activateGraph();
        EL.navLoader.classList.add("active");
        try { await gLoadVisNetwork(); } finally { EL.navLoader.classList.remove("active"); }
        gBuildAndRender(gGetVersions(), STATE.redditAll);
      } else if (view === "arch") {
        activateArch();
        EL.navLoader.classList.add("active");
        try { await aLoadPako(); } finally { EL.navLoader.classList.remove("active"); }
        aLoadAndRender();
      } else if (view === "triage") {
        activateTriage();
      } else if (view === "docs") {
        activateDocs();
      } else if (view === "cve") {
        activateCve();
      } else if (view === "risk") {
        activateDashboard();
      } else if (view === "release") {
        activateNetwork();
      } else if (view === "credits") {
        activateAck();
      } else if (view === "changelog") {
        activateChangelog();
      } else if (view === "account") {
        activateUsers();
      } else if (view === "eval-rewriter") {
        // Admin-only: a shared/bookmarked URL from a non-admin session
        // silently falls through to the normal feed instead of erroring.
        const u = uaUser();
        if (u && u.role === "admin") activateEvalRewriter();
      } else if (view === "eval-evaluator") {
        const u = uaUser();
        if (u && u.role === "admin") activateEvalEvaluator();
      } else if (view === "eval-orchestrator") {
        const u = uaUser();
        if (u && u.role === "admin") activateEvalOrchestrator();
      }
    });
