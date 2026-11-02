/**
 * script.js — ProctorAI Exam Behavior Tracker + Webcam Head Detection
 *
 * Features:
 *   1. WEBCAM GATE — exam won't start without webcam permission
 *   2. 5-STRIKE RULE — 5 total violations = auto-submit and exit
 *   3. Copy/Paste BLOCKED on text answers with violation warning
 *   4. Tab switch, idle time, answer changes, head movements tracked
 *   5. MediaPipe Face Mesh for head pose detection
 *   6. Supports both MCQ and writing (text) questions
 */
(function () {
    "use strict";

    const MAX_VIOLATIONS = 5;

    // ── State ────────────────────────────────────────────────────────────
    const state = {
        currentQuestion: 0,
        totalQuestions:   0,
        answers:          {},      // MCQ answers
        textAnswers:      {},      // Text question answers
        answerChanges:    0,
        tabSwitches:      0,
        copyPasteCount:   0,
        idleTime:         0,
        headMovements:    0,
        violationCount:   0,       // total violations (all types)
        questionTimes:    [],
        questionStart:    Date.now(),
        lastActivity:     Date.now(),
        submitted:        false,
        faceDetected:     false,
        lastHeadOk:       true,
        webcamReady:      false,
        examStarted:      false,
    };

    // ── DOM References ───────────────────────────────────────────────────
    const questionBlocks  = document.querySelectorAll(".question-block");
    const prevBtn         = document.getElementById("prevBtn");
    const nextBtn         = document.getElementById("nextBtn");
    const submitBtn       = document.getElementById("submitBtn");
    const dotsContainer   = document.getElementById("questionDots");
    const timerText       = document.getElementById("timerText");
    const alertContainer  = document.getElementById("alertContainer");
    const currentQNum     = document.getElementById("currentQNum");
    const webcamGate      = document.getElementById("webcamGate");
    const examStatusBar   = document.getElementById("examStatusBar");
    const examLayout      = document.getElementById("examLayout");
    const violationOverlay = document.getElementById("violationOverlay");
    const violationDetail  = document.getElementById("violationDetail");
    const vCountEl        = document.getElementById("vCount");

    // Monitoring sidebar
    const metricTabs     = document.getElementById("metricTabs");
    const metricIdle     = document.getElementById("metricIdle");
    const metricChanges  = document.getElementById("metricChanges");
    const metricCopy     = document.getElementById("metricCopy");
    const metricHead     = document.getElementById("metricHead");
    const metricHeadSide = document.getElementById("metricHeadSide");
    const faceStatus     = document.getElementById("faceStatus");
    const threatFill     = document.getElementById("threatFill");
    const threatText     = document.getElementById("threatText");
    const webcamStatus   = document.getElementById("webcamStatus");

    state.totalQuestions = questionBlocks.length;

    // ══════════════════════════════════════════════════════════════════════
    // VIOLATION SYSTEM — 5 strikes = auto-submit
    // ══════════════════════════════════════════════════════════════════════

    function addViolation(reason) {
        if (state.submitted) return;
        state.violationCount++;
        if (vCountEl) vCountEl.textContent = state.violationCount;

        // Flash the counter red
        const counter = document.getElementById("violationCounter");
        if (counter) {
            counter.classList.add("v-flash");
            setTimeout(() => counter.classList.remove("v-flash"), 600);
        }

        showAlert(`⚠ VIOLATION ${state.violationCount}/5 — ${reason}`);

        if (state.violationCount >= MAX_VIOLATIONS) {
            autoSubmitExam();
        }
    }

    async function autoSubmitExam() {
        if (state.submitted) return;
        state.submitted = true;

        // Show violation overlay
        if (violationOverlay) {
            violationOverlay.style.display = "flex";
            if (violationDetail) {
                violationDetail.textContent = `Violations: Tab switches (${state.tabSwitches}), Copy/Paste (${state.copyPasteCount}), Head moves (${state.headMovements})`;
            }
        }

        // Send the exam data
        const redirectUrl = await sendExamData(true);
        if (!redirectUrl) {
            if (violationOverlay) violationOverlay.style.display = "none";
            showAlert("We could not submit your assessment. Please check your connection and submit again.");
            state.submitted = false;
            return;
        }

        // Stop webcam
        const videoEl = document.getElementById("webcamVideo");
        if (videoEl && videoEl.srcObject) {
            videoEl.srcObject.getTracks().forEach(t => t.stop());
        }

        // Redirect after delay
        setTimeout(() => {
            window.location.href = redirectUrl;
        }, 4000);
    }

    // ══════════════════════════════════════════════════════════════════════
    // WEBCAM GATE — must allow webcam before exam starts
    // ══════════════════════════════════════════════════════════════════════

    window.requestWebcam = function() {
        const gateStatus = document.getElementById("gateStatus");
        const enableBtn  = document.getElementById("enableCamBtn");

        enableBtn.textContent = "Connecting to camera…";
        enableBtn.classList.add("loading");

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (gateStatus) gateStatus.textContent = "Camera access is not available in this browser.";
            enableBtn.textContent = "Try camera again";
            enableBtn.classList.remove("loading");
            return;
        }

        navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: "user" } })
            .then(async stream => {
                const videoEl = document.getElementById("webcamVideo");
                videoEl.srcObject = stream;
                await videoEl.play();
                state.webcamReady = true;

                // Hide gate, show exam
                webcamGate.style.display = "none";
                examStatusBar.style.display = "flex";
                examLayout.style.display = "grid";
                state.examStarted = true;
                state.questionStart = Date.now();
                state.lastActivity = Date.now();

                // Initialize face mesh after webcam is ready
                setTimeout(initFaceMesh, 500);
            })
            .catch(err => {
                console.error("Webcam denied:", err);
                if (gateStatus) {
                    gateStatus.textContent = "Camera access failed. Check your browser permission and try again.";
                    gateStatus.style.color = "var(--danger)";
                }
                enableBtn.textContent = "Try camera again";
                enableBtn.classList.remove("loading");
            });
    };

    // ══════════════════════════════════════════════════════════════════════
    // QUESTION NAVIGATION
    // ══════════════════════════════════════════════════════════════════════

    // Initialize dots
    for (let i = 0; i < state.totalQuestions; i++) {
        const dot = document.createElement("div");
        dot.className = "q-dot" + (i === 0 ? " active" : "");
        dot.title = `Question ${i + 1}`;
        dot.addEventListener("click", () => goToQuestion(i));
        dotsContainer.appendChild(dot);
    }

    function goToQuestion(index) {
        // Save current text answer before navigating
        saveCurrentTextAnswer();

        const elapsed = (Date.now() - state.questionStart) / 1000;
        state.questionTimes[state.currentQuestion] =
            (state.questionTimes[state.currentQuestion] || 0) + elapsed;

        questionBlocks[state.currentQuestion].style.display = "none";
        questionBlocks[index].style.display = "block";
        state.currentQuestion = index;
        state.questionStart = Date.now();

        currentQNum.textContent = index + 1;
        updateDots();
        updateNavButtons();
    }

    function saveCurrentTextAnswer() {
        const block = questionBlocks[state.currentQuestion];
        if (block && block.dataset.type === "text") {
            const qid = block.dataset.qid;
            const textarea = document.getElementById("textq" + qid);
            if (textarea) {
                state.textAnswers[qid] = textarea.value;
            }
        }
    }

    function updateDots() {
        const dots = dotsContainer.children;
        for (let i = 0; i < dots.length; i++) {
            const block = questionBlocks[i];
            const qid = parseInt(block.dataset.qid);
            const isText = block.dataset.type === "text";
            const answered = isText ? !!state.textAnswers[qid] : !!state.answers[qid];

            dots[i].classList.toggle("active", i === state.currentQuestion);
            dots[i].classList.toggle("answered", answered);
        }
    }

    function updateNavButtons() {
        prevBtn.disabled = state.currentQuestion === 0;
        if (state.currentQuestion === state.totalQuestions - 1) {
            nextBtn.style.display   = "none";
            submitBtn.style.display = "inline-flex";
        } else {
            nextBtn.style.display   = "inline-flex";
            submitBtn.style.display = "none";
        }
    }

    prevBtn.addEventListener("click", () => {
        if (state.currentQuestion > 0) goToQuestion(state.currentQuestion - 1);
    });
    nextBtn.addEventListener("click", () => {
        if (state.currentQuestion < state.totalQuestions - 1)
            goToQuestion(state.currentQuestion + 1);
    });

    // ── MCQ Answer Tracking ──────────────────────────────────────────────
    document.querySelectorAll('.option-card input[type="radio"]').forEach((radio) => {
        radio.addEventListener("change", function () {
            const qid = this.name.replace("q", "");
            if (state.answers[qid] && state.answers[qid] !== this.value) {
                state.answerChanges++;
                updateMetrics();
            }
            state.answers[qid] = this.value;
            updateDots();
        });
    });

    // ── Text Answer Character Count ──────────────────────────────────────
    document.querySelectorAll(".text-answer").forEach((textarea) => {
        const qid = textarea.id.replace("textq", "");
        textarea.addEventListener("input", function () {
            state.textAnswers[qid] = this.value;
            const countEl = document.getElementById("charCount" + qid);
            if (countEl) countEl.textContent = this.value.length + " characters";
            updateDots();
        });
    });

    // ══════════════════════════════════════════════════════════════════════
    // COPY / PASTE BLOCKING — with violation counter
    // ══════════════════════════════════════════════════════════════════════

    ["copy", "cut", "paste"].forEach(evt => {
        document.addEventListener(evt, function (e) {
            if (state.submitted || !state.examStarted) return;
            e.preventDefault();
            state.copyPasteCount++;
            updateMetrics();
            addViolation(`${evt.toUpperCase()} attempt blocked!`);
        });
    });

    // Also block via keyboard shortcuts on textareas
    document.addEventListener("keydown", function(e) {
        if (!state.examStarted || state.submitted) return;
        if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V' || e.key === 'c' || e.key === 'C' || e.key === 'x' || e.key === 'X')) {
            // Only block on text answer areas
            if (e.target.classList.contains("text-answer")) {
                e.preventDefault();
                state.copyPasteCount++;
                updateMetrics();
                addViolation(`Keyboard ${e.key.toUpperCase()} shortcut blocked!`);
            }
        }
    });

    // ── Tab Switch Detection ─────────────────────────────────────────────
    document.addEventListener("visibilitychange", () => {
        if (document.hidden && !state.submitted && state.examStarted) {
            state.tabSwitches++;
            updateMetrics();
            addViolation("Tab switch detected!");
        }
    });

    // ── Idle Time Tracking ───────────────────────────────────────────────
    ["mousemove", "keydown", "click", "scroll"].forEach((evt) => {
        document.addEventListener(evt, () => { state.lastActivity = Date.now(); });
    });

    setInterval(() => {
        if (state.submitted || !state.examStarted) return;
        const idleSecs = (Date.now() - state.lastActivity) / 1000;
        if (idleSecs > 3) {
            state.idleTime += 1;
            updateMetrics();
        }
    }, 1000);

    // ── Timer Display ────────────────────────────────────────────────────
    setInterval(() => {
        if (state.submitted || !state.examStarted) return;
        const elapsed = Math.floor((Date.now() - state.questionStart) / 1000);
        const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
        const s = String(elapsed % 60).padStart(2, "0");
        timerText.textContent = `${m}:${s}`;
    }, 500);

    // ── Update Metrics ───────────────────────────────────────────────────
    function updateMetrics() {
        if (metricTabs)     metricTabs.textContent     = state.tabSwitches;
        if (metricIdle)     metricIdle.textContent     = Math.round(state.idleTime) + "s";
        if (metricChanges)  metricChanges.textContent  = state.answerChanges;
        if (metricCopy)     metricCopy.textContent     = state.copyPasteCount;
        if (metricHead)     metricHead.textContent     = state.headMovements;
        if (metricHeadSide) metricHeadSide.textContent = state.headMovements;

        const score = state.tabSwitches * 3 + state.copyPasteCount * 5 +
                      state.headMovements * 2 + Math.floor(state.idleTime / 15);
        const pct = Math.min(score * 2, 100);
        if (threatFill) {
            threatFill.style.width = pct + "%";
            if (pct < 30) { threatFill.style.background = "var(--success)"; threatText.textContent = "Low"; threatText.style.color = "var(--success)"; }
            else if (pct < 60) { threatFill.style.background = "var(--warning)"; threatText.textContent = "Moderate"; threatText.style.color = "var(--warning)"; }
            else { threatFill.style.background = "var(--danger)"; threatText.textContent = "Elevated"; threatText.style.color = "var(--danger)"; }
        }
    }

    // ── Alert Banners ────────────────────────────────────────────────────
    function showAlert(message) {
        const banner = document.createElement("div");
        banner.className = "alert-banner";
        banner.textContent = message;
        alertContainer.appendChild(banner);
        setTimeout(() => banner.remove(), 4000);
    }

    // ══════════════════════════════════════════════════════════════════════
    // WEBCAM + MEDIAPIPE FACE MESH — Head Pose Detection
    // ══════════════════════════════════════════════════════════════════════

    const YAW_THRESHOLD   = 25;
    const PITCH_THRESHOLD = 20;
    let lastHeadEventTime = Date.now();
    let faceMeshRetries = 0;
    const HEAD_COOLDOWN_MS = 2000;

    function initFaceMesh() {
        const videoEl = document.getElementById("webcamVideo");
        const canvasEl = document.getElementById("webcamOverlay");
        const canvasCtx = canvasEl ? canvasEl.getContext("2d") : null;

        if (typeof FaceMesh === "undefined") {
            faceMeshRetries++;
            if (faceMeshRetries <= 20) {
                if (webcamStatus) webcamStatus.textContent = "LOADING FACE TRACKING…";
                setTimeout(initFaceMesh, 500);
            } else if (webcamStatus) {
                webcamStatus.textContent = "CAMERA ACTIVE";
                showAlert("Face tracking could not load. Camera monitoring remains active.");
            }
            return;
        }

        const faceMesh = new FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        faceMesh.onResults(function(results) {
            if (!canvasCtx) return;
            canvasEl.width  = results.image.width  || 320;
            canvasEl.height = results.image.height || 240;
            canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);

            if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
                state.faceDetected = false;
                if (faceStatus) { faceStatus.textContent = "NO"; faceStatus.className = "metric-val face-no"; }

                const now = Date.now();
                if (now - lastHeadEventTime > HEAD_COOLDOWN_MS) {
                    state.headMovements++;
                    lastHeadEventTime = now;
                    updateMetrics();
                    addViolation("Face not detected — look at the screen!");
                }
                return;
            }

            state.faceDetected = true;
            if (faceStatus) { faceStatus.textContent = "YES"; faceStatus.className = "metric-val face-ok"; }
            if (webcamStatus) webcamStatus.textContent = "ACTIVE";

            const landmarks = results.multiFaceLandmarks[0];
            canvasCtx.strokeStyle = "rgba(54, 95, 229, 0.6)";
            canvasCtx.lineWidth = 1;
            drawFaceOutline(canvasCtx, canvasEl, landmarks);

            const noseTip  = landmarks[1];
            const chin     = landmarks[152];
            const leftEye  = landmarks[33];
            const rightEye = landmarks[263];
            const forehead = landmarks[10];

            const eyeMidX = (leftEye.x + rightEye.x) / 2;
            const eyeDist = Math.abs(rightEye.x - leftEye.x);
            const yawRatio = (noseTip.x - eyeMidX) / (eyeDist || 0.001);
            const yaw = yawRatio * 90;

            const faceMidY = (forehead.y + chin.y) / 2;
            const faceHeight = Math.abs(chin.y - forehead.y);
            const pitchRatio = (noseTip.y - faceMidY) / (faceHeight || 0.001);
            const pitch = pitchRatio * 90;

            const lookingAway = Math.abs(yaw) > YAW_THRESHOLD || pitch > PITCH_THRESHOLD;

            if (lookingAway) {
                canvasCtx.fillStyle = "rgba(184, 50, 60, 0.3)";
                canvasCtx.fillRect(0, 0, canvasEl.width, canvasEl.height);
                canvasCtx.fillStyle = "#b8323c";
                canvasCtx.font = "bold 12px Arial, sans-serif";
                canvasCtx.fillText("LOOK TOWARD SCREEN", 10, 20);
            } else {
                canvasCtx.fillStyle = "#16845b";
                canvasCtx.font = "10px Arial, sans-serif";
                canvasCtx.fillText("FACE VISIBLE", 10, 16);
            }

            const now = Date.now();
            if (lookingAway && state.lastHeadOk && now - lastHeadEventTime > HEAD_COOLDOWN_MS) {
                state.headMovements++;
                lastHeadEventTime = now;
                updateMetrics();
                addViolation("Head movement — face the screen!");
            }
            state.lastHeadOk = !lookingAway;
        });

        // Process frames
        async function processFrame() {
            if (state.submitted || !state.examStarted) return;
            try {
                await faceMesh.send({ image: videoEl });
                window.setTimeout(processFrame, 150);
            } catch (error) {
                console.error("Face tracking failed:", error);
                if (webcamStatus) webcamStatus.textContent = "CAMERA ACTIVE";
            }
        }
        processFrame();
        if (webcamStatus) webcamStatus.textContent = "ACTIVE";
    }

    function drawFaceOutline(ctx, canvas, landmarks) {
        const faceOval = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];
        ctx.beginPath();
        for (let i = 0; i < faceOval.length; i++) {
            const pt = landmarks[faceOval[i]];
            const x = pt.x * canvas.width;
            const y = pt.y * canvas.height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // ══════════════════════════════════════════════════════════════════════
    // EXAM SUBMISSION
    // ══════════════════════════════════════════════════════════════════════

    async function sendExamData(isAutoSubmit) {
        // Save current text answer
        saveCurrentTextAnswer();

        // Record time for last question
        const elapsed = (Date.now() - state.questionStart) / 1000;
        state.questionTimes[state.currentQuestion] =
            (state.questionTimes[state.currentQuestion] || 0) + elapsed;

        const totalTime = state.questionTimes.reduce((a, b) => a + (b || 0), 0);
        const avgTime = state.totalQuestions > 0 ? totalTime / state.totalQuestions : 0;

        const payload = {
            answers:              state.answers,
            text_answers:         state.textAnswers,
            time_per_question:    parseFloat(avgTime.toFixed(2)),
            tab_switch_count:     state.tabSwitches,
            idle_time:            parseFloat(state.idleTime.toFixed(2)),
            answer_change_count:  state.answerChanges,
            copy_paste_attempts:  state.copyPasteCount,
            head_movement_count:  state.headMovements,
            violation_count:      state.violationCount,
            auto_submitted:       isAutoSubmit,
        };

        try {
            const response = await fetch("/submit_exam", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!response.ok) throw new Error(`Submission failed (${response.status})`);
            const result = await response.json();
            if (result.status !== "ok" || !result.redirect) {
                throw new Error(result.msg || "The server did not confirm the submission");
            }
            return result.redirect;
        } catch (err) {
            console.error("Submission error:", err);
            return null;
        }
    }

    submitBtn.addEventListener("click", async () => {
        if (state.submitted) return;
        state.submitted = true;
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting…";

        const redirectUrl = await sendExamData(false);
        if (!redirectUrl) {
            state.submitted = false;
            submitBtn.disabled = false;
            submitBtn.textContent = "Try submitting again";
            showAlert("We could not submit your assessment. Check your connection and try again.");
            return;
        }

        // Stop webcam
        const videoEl = document.getElementById("webcamVideo");
        if (videoEl && videoEl.srcObject) {
            videoEl.srcObject.getTracks().forEach(t => t.stop());
        }

        window.location.href = redirectUrl;
    });

})();
