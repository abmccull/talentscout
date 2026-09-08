let meta = #{
    name: "talentscout-game-readiness",
    description: "One-panel Youth Scout Early Access production-readiness review: local delta, engineering, gameplay, first hour, UX, a11y, release evidence, Steam/desktop",
    when_to_use: "Before calling TalentScout production-ready, promoting a Youth EA candidate, or asking for a ship/no-ship verdict on the game",
    phases: [
        #{ title: "Map", detail: "bind repo, branch, and product surface" },
        #{ title: "Panel", detail: "eight parallel production-readiness auditors" },
        #{ title: "Challenge", detail: "adversarial check of pass claims" },
        #{ title: "Verdict", detail: "single ship/no-ship report" },
    ],
};

let map_schema = #{
    "type": "object",
    "required": ["branch", "dirty_summary", "product_loop", "evidence_notes"],
    "properties": #{
        "branch": #{ "type": "string" },
        "dirty_summary": #{ "type": "string" },
        "product_loop": #{ "type": "string" },
        "evidence_notes": #{ "type": "string" },
    },
};

let audit_schema = #{
    "type": "object",
    "required": ["section", "verdict", "findings", "blockers"],
    "properties": #{
        "section": #{ "type": "string" },
        "verdict": #{ "type": "string" },
        "findings": #{
            "type": "array",
            "maxItems": 8,
            "items": #{
                "type": "object",
                "required": ["check", "status", "evidence"],
                "properties": #{
                    "check": #{ "type": "string" },
                    "status": #{ "type": "string" },
                    "evidence": #{ "type": "string" },
                },
            },
        },
        "blockers": #{
            "type": "array",
            "maxItems": 6,
            "items": #{ "type": "string" },
        },
    },
};

let challenge_schema = #{
    "type": "object",
    "required": ["still_valid", "reason", "evidence"],
    "properties": #{
        "still_valid": #{ "type": "boolean" },
        "reason": #{ "type": "string" },
        "evidence": #{ "type": "string" },
    },
};

let root = if args == () { () } else { args.root };
if root == () {
    pause("verification", "Pass args.root — the TalentScout repo path, e.g. C:\\\\Users\\\\hands\\\\OneDrive\\\\Pictures\\\\TalentScout\\\\talentscout");
}

let root_json = json_encode(root);
let focus = if args == () { () } else { args.focus };
let focus_text = if focus == () {
    "Youth Scout Early Access packaged Steam/Electron game"
} else {
    focus
};
let focus_json = json_encode(focus_text);

phase("Map");
let map_p = "";
map_p += "Map TalentScout for a production-readiness review. This is a Youth Scout Early Access football-scouting SIM, not a SaaS web app.\n";
map_p += "Repo root: " + root_json + "\n";
map_p += "Focus: " + focus_json + "\n";
map_p += "Use read-only tools from that root: list_dir, read_file, grep, and git status/log via the terminal if available.\n";
map_p += "Do not guess. Read package.json, docs/release/release-certification.md, docs/release/release-evidence-status.json, docs/release/production-readiness-audit.md, and the current git status.\n";
map_p += "Return:\n";
map_p += "- branch: current branch and short HEAD sha, plus whether the tree is dirty\n";
map_p += "- dirty_summary: uncommitted files that could change the candidate, or 'clean'\n";
map_p += "- product_loop: one short paragraph of the intended scout loop (find, observe, report, consequence)\n";
map_p += "- evidence_notes: which release gates in docs/release already have artifacts vs Unverified\n";
let map_r = agent(map_p, #{
    label: "map-repo",
    capability_mode: "read-only",
    output_schema: map_schema,
});

let branch = "unknown";
let dirty_summary = "unverified";
let product_loop = "Youth Scout Early Access: discover, observe, report, live with consequences.";
let evidence_notes = "";
if map_r != () && map_r.success && map_r.output != () {
    if map_r.output.branch != () { branch = map_r.output.branch; }
    if map_r.output.dirty_summary != () { dirty_summary = map_r.output.dirty_summary; }
    if map_r.output.product_loop != () { product_loop = map_r.output.product_loop; }
    if map_r.output.evidence_notes != () { evidence_notes = map_r.output.evidence_notes; }
} else {
    log("Map agent failed; panel will work from the repo path alone.");
}

let map_blob = "";
map_blob += "branch: " + branch + "\n";
map_blob += "dirty: " + dirty_summary + "\n";
map_blob += "loop: " + product_loop + "\n";
map_blob += "evidence: " + evidence_notes + "\n";
let map_json = json_encode(map_blob);

phase("Panel");
let sections = [
    #{
        id: "local-delta",
        mode: "read-only",
        checks: "Inspect git status and the actual uncommitted/local diff. Flag anything that would make HEAD a different candidate than the working tree (settings, engine, e2e, electron). status=fail if dirty work is required for claimed readiness but uncommitted. status=pass only if the delta is empty or clearly non-shipping.",
    },
    #{
        id: "engineering",
        mode: "execute",
        checks: "From the repo root, inspect and if possible run existing gates only: git status; package.json scripts; npm run typecheck if cheap enough; look at recent test/e2e logs rather than inventing results. Cover Electron sandbox/preload IPC allowlist, no secrets in src, save/cloud paths, CI workflows. Do not run soak, replayability-1000, or electron:dist. fail on broken typecheck, missing security wrapper, or secrets. unverified if a command cannot be run.",
    },
    #{
        id: "gameplay",
        mode: "read-only",
        checks: "Youth Scout loop integrity: opening case, weekly simulation, reports, retainers/finance, save migration. Read src/engine, tests/invariants, and gameScreenScope. Confirm future full-game screens cannot be entered from Youth EA. fail if a player-facing action does not persist or a quarantined screen is reachable. Do not treat design docs as proof.",
    },
    #{
        id: "opening",
        mode: "read-only",
        checks: "First hour from a cold main menu: splash skip, New Game, Settings (only real controls), opening discovery hook, first week. Read MainMenu, SettingsPreferences, settingsStore, openingCase, e2e/screens/main-menu-settings.spec.ts, e2e/flows/opening-discovery-hook.spec.ts. fail if Settings or New Game is missing, or if settings that are shown cannot change live state.",
    },
    #{
        id: "rendered-ux",
        mode: "read-only",
        checks: "Playable UI of Desk, Planner, Prospects, Reports, World, Career, main menu, settings. Read GameLayout, Dashboard, CalendarScreen, design-audit-report.md if present. Score only from code and existing screenshots/e2e, not imagined pixels. fail on blocking empty states, missing back paths, or main-menu dead controls.",
    },
    #{
        id: "accessibility",
        mode: "read-only",
        checks: "Keyboard nav, focus, labels, reduced-motion, colorblind filters, e2e/accessibility. Read useKeyboardNav, SettingsApplier, globals.css, docs/release/manual-assistive-technology.md. Automated axe e2e is supporting evidence only. Manual NVDA/VoiceOver remain unverified unless attestation files exist. fail on missing names/focus traps in first-hour screens; do not pass manual AT without files.",
    },
    #{
        id: "release-evidence",
        mode: "read-only",
        checks: "docs/release/release-evidence-status.json, release-certification.md, artifacts/release if present, release:preflight / test:release-evidence scripts. Mark each required gate pass/fail/unverified from files on disk. Human usability, packaged matrix, NVDA, VoiceOver, hardware must be unverified unless attestations exist. fail if the repo claims Ready while required gates are Unverified.",
    },
    #{
        id: "steam-desktop",
        mode: "read-only",
        checks: "Electron main/preload/security, steamworks, achievements VDF, store copy, installer scripts. Read electron/main.js, electron/preload.js, tests/electron/desktopSecurity.test.ts, steamcmd, docs/release/desktop-security-review.md. fail on sandbox off, untrusted IPC, or missing Steam achievement import check. Packaged Windows/mac/linux install evidence is unverified unless runtime JSON exists.",
    },
];

let ajobs = [];
for s in sections {
    let ap = "";
    ap += "You are one auditor in a TalentScout Youth Scout Early Access production-readiness panel.\n";
    ap += "Section id (return this exact section string): " + s.id + "\n";
    ap += "Repo root: " + root_json + "\n";
    ap += "Focus: " + focus_json + "\n";
    ap += "Map context: " + map_json + "\n";
    ap += "Checks:\n" + s.checks + "\n";
    ap += "Rules:\n";
    ap += "- Inspect the repo with tools. Do not answer from memory.\n";
    ap += "- status must be pass, fail, unverified, or n_a.\n";
    ap += "- unverified if you cannot prove it from files, git, or a command you actually ran.\n";
    ap += "- n_a only when the surface does not exist; say why.\n";
    ap += "- This is a game, not a REST API. Do not fail it for missing pagination or wildcard CORS unless those surfaces exist.\n";
    ap += "- Human/packaged/Steam promotion evidence cannot be invented.\n";
    ap += "- verdict is pass only if no fail and no critical unverified ship blocker; otherwise fail or unverified.\n";
    ap += "- findings: at most 8 {check,status,evidence} with file paths.\n";
    ap += "- blockers: short strings for ship-blocking fails. Empty array if none.\n";
    ajobs.push(#{
        prompt: ap,
        label: "audit:" + s.id,
        capability_mode: s.mode,
        output_schema: audit_schema,
    });
}
let audits = parallel(ajobs);

let all_items = [];
let all_blockers = [];
let pass_claims = [];
let ai = 0;
for ar in audits {
    let section_id = sections[ai].id;
    if ar != () && ar.success && ar.output != () {
        let sec = if ar.output.section == () { section_id } else { ar.output.section };
        if ar.output.findings != () {
            for it in ar.output.findings {
                if it != () && it.check != () && it.status != () {
                    let ev = if it.evidence == () { "" } else { it.evidence };
                    all_items.push(#{
                        section: sec,
                        check: it.check,
                        status: it.status,
                        evidence: ev,
                    });
                    if it.status == "pass" {
                        pass_claims.push(#{
                            section: sec,
                            check: it.check,
                            status: it.status,
                            evidence: ev,
                        });
                    }
                    if it.status == "fail" {
                        all_blockers.push("[" + sec + "] " + it.check + " — " + ev);
                    }
                }
            }
        }
        if ar.output.blockers != () {
            for b in ar.output.blockers {
                if b != () && b != "" {
                    all_blockers.push("[" + sec + "] " + b);
                }
            }
        }
        if ar.output.verdict == "fail" || ar.output.verdict == "unverified" {
            if ar.output.verdict == "fail" {
                all_blockers.push("[" + sec + "] Section verdict=" + ar.output.verdict);
            }
        }
    } else {
        log("Audit failed for section: " + section_id);
        all_blockers.push("[" + section_id + "] Audit agent failed — treat section as unverified");
        all_items.push(#{
            section: section_id,
            check: "section audit completed",
            status: "unverified",
            evidence: "Audit agent failed or returned unusable output.",
        });
    }
    ai += 1;
}

phase("Challenge");
const MAX_CLAIMS = 8;
let claims_to_check = [];
let ci = 0;
for c in pass_claims {
    if ci < MAX_CLAIMS {
        claims_to_check.push(c);
        ci += 1;
    }
}
if pass_claims.len() > MAX_CLAIMS {
    log("Capped pass-claim challenges from " + pass_claims.len().to_string() + " to " + MAX_CLAIMS.to_string());
}

if claims_to_check.len() > 0 {
    let cjobs = [];
    let cidx = 0;
    for c in claims_to_check {
        let cp = "";
        cp += "Adversarially verify this TalentScout PASS claim. Default still_valid=false if evidence is weak, stale, or only a comment.\n";
        cp += "Section: " + json_encode(c.section) + "\n";
        cp += "Check: " + json_encode(c.check) + "\n";
        cp += "Claimed evidence: " + json_encode(c.evidence) + "\n";
        cp += "Repo root: " + root_json + "\n";
        cp += "Independently inspect the repo with read-only tools.\n";
        cp += "still_valid=true only with concrete independent evidence the control exists on this tree.\n";
        cp += "Docs that say a gate is planned, or Unverified attestations, are not a pass.\n";
        cjobs.push(#{
            prompt: cp,
            label: "challenge:" + cidx.to_string(),
            capability_mode: "read-only",
            output_schema: challenge_schema,
        });
        cidx += 1;
    }
    let challenges = parallel(cjobs);
    let chi = 0;
    for ch in challenges {
        let claim = claims_to_check[chi];
        let ok = false;
        if ch != () && ch.success && ch.output != () {
            if ch.output.still_valid == true && ch.output.evidence != () && ch.output.evidence != "" {
                ok = true;
            }
        }
        if !ok {
            let rebuilt = [];
            for it in all_items {
                if it.section == claim.section && it.check == claim.check && it.status == "pass" {
                    rebuilt.push(#{
                        section: it.section,
                        check: it.check,
                        status: "unverified",
                        evidence: "PASS demoted: challenge failed or lacked independent evidence. Original: " + it.evidence,
                    });
                } else {
                    rebuilt.push(it);
                }
            }
            all_items = rebuilt;
            log("Demoted pass claim: [" + claim.section + "] " + claim.check);
        }
        chi += 1;
    }
}

phase("Verdict");
let n_fail = 0;
let n_unverified = 0;
let n_pass = 0;
let n_na = 0;
for it in all_items {
    if it.status == "fail" {
        n_fail += 1;
    } else if it.status == "unverified" {
        n_unverified += 1;
    } else if it.status == "pass" {
        n_pass += 1;
    } else if it.status == "n_a" {
        n_na += 1;
    } else {
        n_unverified += 1;
    }
}

let verdict = "Ready";
if n_fail > 0 {
    verdict = "Not ready";
} else if n_unverified > 0 {
    verdict = "Ready with conditions";
}

let report = "";
report += "# TalentScout game-readiness\n\n";
report += "**Verdict: " + verdict + "**\n\n";
report += "Repo: " + root_json + "\n";
report += "Focus: " + focus_json + "\n";
report += "Branch: " + branch + "\n";
report += "Working tree: " + dirty_summary + "\n\n";
report += "## Product loop\n\n" + product_loop + "\n\n";
if evidence_notes != "" {
    report += "## Existing release-evidence notes\n\n" + evidence_notes + "\n\n";
}
report += "## Blockers\n\n";
if all_blockers.len() == 0 {
    report += "None listed.\n\n";
} else {
    for b in all_blockers {
        report += "- " + b + "\n";
    }
    report += "\n";
}
report += "## Counts\n\n";
report += "- pass: " + n_pass.to_string() + "\n";
report += "- fail: " + n_fail.to_string() + "\n";
report += "- unverified: " + n_unverified.to_string() + "\n";
report += "- n_a: " + n_na.to_string() + "\n\n";
report += "## Panel detail\n\n";
for it in all_items {
    report += "- **[" + it.section + "]** " + it.check + " — `" + it.status + "`\n";
    report += "  - Evidence: " + it.evidence + "\n";
}
report += "\n## Fastest path to green\n\n";
if verdict == "Ready" {
    report += "No blockers in audited evidence. Re-run before promoting an immutable candidate.\n";
} else if n_fail > 0 {
    report += "1. Fix every fail blocker.\n";
    report += "2. Convert critical unverified packaged/human/Steam gates into attestations or stop claiming Ready.\n";
    report += "3. Commit or discard dirty work so the candidate SHA matches the tree you reviewed.\n";
    report += "4. Re-run `/talentscout-game-readiness`.\n";
} else {
    report += "1. Close unverified items with repo or package evidence, or keep the verdict conditional.\n";
    report += "2. Do not promote to Steam until Stage 2 attestations exist.\n";
}

let path = write_scratch_file("talentscout-game-readiness.md", report);
complete(#{
    summary: "Verdict: " + verdict + " (fail=" + n_fail.to_string() + ", unverified=" + n_unverified.to_string() + ", pass=" + n_pass.to_string() + ")",
    verdict: verdict,
    blockers: all_blockers,
    counts: #{
        pass: n_pass,
        fail: n_fail,
        unverified: n_unverified,
        n_a: n_na,
    },
    path: path,
    report: report,
});
