"""
app.py
======
Flask backend for the ProctorAI exam monitoring system.

Routes:
  /             -> Login/Signup page
  /register     -> POST: create new user
  /login        -> POST: authenticate user
  /logout       -> Clear session
  /dashboard    -> Student test selection and attempt history
  /exam         -> Selected exam interface (student only)
  /submit_exam  -> POST: receive answers + behavior data, run ML prediction
  /result       -> Exam result page
  /admin        -> Admin dashboard (examiner only)
  /api/students -> JSON API for dashboard
"""

import os
import json
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from model import predict_behavior, train_model, load_model, MODEL_PATH, FEATURE_COLS

app = Flask(__name__)
app.secret_key = "proctorAI_secret_2026_exam"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
USERS_FILE = os.path.join(BASE_DIR, "users.json")

# In-memory exam records
exam_records = []

# Questions use simple keyword scoring for written responses, for demonstration only.
TESTS = {
    "dsa": {
        "id": "dsa", "name": "Data Structures & Algorithms",
        "short_name": "DSA", "description": "Core data structures, searching and sorting.",
        "level": "Foundations", "duration": 10, "icon": "DS",
        "questions": [
            {"id": 1, "type": "mcq", "question": "What is the time complexity of binary search on a sorted array?",
             "options": ["O(n)", "O(log n)", "O(n log n)", "O(1)"], "answer": "O(log n)"},
            {"id": 2, "type": "mcq", "question": "Which data structure follows the FIFO principle?",
             "options": ["Stack", "Queue", "Tree", "Heap"], "answer": "Queue"},
            {"id": 3, "type": "mcq", "question": "Which traversal of a binary search tree returns values in sorted order?",
             "options": ["Preorder", "Postorder", "Inorder", "Level order"], "answer": "Inorder"},
            {"id": 4, "type": "mcq", "question": "What is the average time complexity of merge sort?",
             "options": ["O(n)", "O(log n)", "O(n log n)", "O(n²)"], "answer": "O(n log n)"},
            {"id": 5, "type": "text", "question": "Describe the LIFO principle and name one common use of a stack.",
             "keywords": ["lifo", "last in first out", "push", "pop", "function", "undo", "stack"]},
        ],
    },
    "analytical": {
        "id": "analytical", "name": "Analytical Skills",
        "short_name": "Analytical", "description": "A mixed-format set of logic, data and quantitative questions.",
        "level": "Mixed format", "duration": 10, "icon": "AN",
        "questions": [
            {"id": 1, "type": "mcq", "question": "A product costs $80 after a 20% discount. What was its original price?",
             "options": ["$96", "$100", "$104", "$120"], "answer": "$100"},
            {"id": 2, "type": "mcq", "question": "Find the next number: 3, 7, 15, 31, …",
             "options": ["47", "55", "63", "64"], "answer": "63"},
            {"id": 3, "type": "mcq", "question": "A team completes 2/5 of a project in 4 days at a steady rate. How many days are needed for the whole project?",
             "options": ["8", "10", "12", "20"], "answer": "10"},
            {"id": 4, "type": "mcq", "question": "All analysts use data. Mira is an analyst. Which statement follows?",
             "options": ["Mira uses data", "Mira manages a team", "All data users are analysts", "No conclusion follows"], "answer": "Mira uses data"},
            {"id": 5, "type": "text", "question": "A store's weekly visitors rose from 200 to 250. Explain the percentage increase.",
             "keywords": ["25", "increase", "50", "200", "percent", "%"]},
        ],
    },
    "reasoning": {
        "id": "reasoning", "name": "Logical Reasoning",
        "short_name": "Reasoning", "description": "Patterns, deduction and structured problem solving.",
        "level": "Foundations", "duration": 10, "icon": "LR",
        "questions": [
            {"id": 1, "type": "mcq", "question": "If every Nori is a Vela and every Vela is a Tavi, which must be true?",
             "options": ["Every Tavi is a Nori", "Every Nori is a Tavi", "No Nori is a Tavi", "Some Vela are not Tavi"], "answer": "Every Nori is a Tavi"},
            {"id": 2, "type": "mcq", "question": "Choose the item that does not belong.",
             "options": ["Triangle", "Square", "Circle", "Cube"], "answer": "Cube"},
            {"id": 3, "type": "mcq", "question": "If today is Wednesday, what day will it be 10 days from today?",
             "options": ["Friday", "Saturday", "Sunday", "Monday"], "answer": "Saturday"},
            {"id": 4, "type": "mcq", "question": "Find the next letter: A, C, F, J, O, …",
             "options": ["S", "T", "U", "V"], "answer": "U"},
            {"id": 5, "type": "text", "question": "If all red boxes are heavy and a box is red, what can you conclude about that box?",
             "keywords": ["heavy", "red", "box"]},
        ],
    },
    "ml": {
        "id": "ml", "name": "Machine Learning Concepts",
        "short_name": "ML Concepts", "description": "Model types, evaluation and fundamental ML ideas.",
        "level": "Foundations", "duration": 10, "icon": "ML",
        "questions": [
            {"id": 1, "type": "mcq", "question": "Which task is supervised learning?",
             "options": ["Grouping unlabeled customers", "Predicting house prices from labeled examples", "Compressing images", "Randomly sampling data"], "answer": "Predicting house prices from labeled examples"},
            {"id": 2, "type": "mcq", "question": "What is a common purpose of a validation dataset?",
             "options": ["Tune model choices", "Replace all training data", "Encrypt the labels", "Guarantee perfect accuracy"], "answer": "Tune model choices"},
            {"id": 3, "type": "mcq", "question": "Which metric is often more informative than accuracy on a highly imbalanced dataset?",
             "options": ["Precision and recall", "Number of features", "Training duration", "File size"], "answer": "Precision and recall"},
            {"id": 4, "type": "mcq", "question": "What does overfitting usually mean?",
             "options": ["Model performs well on training data but poorly on new data", "Model has too few training examples to run", "Model always predicts the majority class", "Model has no parameters"], "answer": "Model performs well on training data but poorly on new data"},
            {"id": 5, "type": "text", "question": "In your own words, what does an Isolation Forest use to identify unusual observations?",
             "keywords": ["isolation", "tree", "random", "split", "outlier", "path", "anomaly"]},
        ],
    },
}

# ─── User helpers ─────────────────────────────────────────────────────────────
def get_users():
    if not os.path.exists(USERS_FILE):
        return []
    with open(USERS_FILE, "r") as f:
        return json.load(f)

def save_users(users):
    with open(USERS_FILE, "w") as f:
        json.dump(users, f, indent=2)

# ─── Ensure model ────────────────────────────────────────────────────────────
def ensure_model():
    if not os.path.exists(MODEL_PATH):
        print("[..] Training ML model for the first time ...")
        train_model()
        print("[OK] Model ready.\n")

# ─── Routes ──────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("login.html")

@app.route("/register", methods=["POST"])
def register():
    data = request.get_json()
    fn = data.get("fname", "").strip()
    ln = data.get("lname", "").strip()
    rn = data.get("roll", "").strip()
    em = data.get("email", "").strip().lower()
    pw = data.get("password", "")
    role = data.get("role", "student")

    if not fn or not ln:
        return jsonify({"ok": False, "msg": "Full name required."})
    if not rn:
        return jsonify({"ok": False, "msg": "Roll number required."})
    if not em or "@" not in em:
        return jsonify({"ok": False, "msg": "Valid email required."})
    if len(pw) < 8:
        return jsonify({"ok": False, "msg": "Password must be 8+ characters."})

    users = get_users()
    if any(u["email"] == em for u in users):
        return jsonify({"ok": False, "msg": "Email already registered."})

    users.append({
        "fname": fn, "lname": ln, "roll": rn,
        "email": em, "password": pw, "role": role,
    })
    save_users(users)
    return jsonify({"ok": True, "msg": "Account registered successfully."})

@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    em = data.get("email", "").strip().lower()
    pw = data.get("password", "")

    users = get_users()
    user = next((u for u in users if u["email"] == em and u["password"] == pw), None)

    if not user:
        return jsonify({"ok": False, "msg": "Invalid credentials."})

    session["user"] = user
    redirect_url = "/admin" if user["role"] == "examiner" else "/dashboard"
    return jsonify({"ok": True, "msg": f"Welcome, {user['fname']}!", "redirect": redirect_url})

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))

@app.route("/dashboard")
def dashboard():
    if "user" not in session:
        return redirect(url_for("index"))
    user = session["user"]
    if user.get("role") == "examiner":
        return redirect(url_for("admin"))
    attempts = [
        record for record in exam_records
        if record.get("student_email") == user.get("email", "").lower()
    ]
    return render_template("dashboard.html", user=user, tests=TESTS.values(), attempts=attempts)

@app.route("/exam")
def exam():
    if "user" not in session:
        return redirect(url_for("index"))
    if session["user"].get("role") != "student":
        return redirect(url_for("admin"))
    test_id = request.args.get("test", "")
    selected_test = TESTS.get(test_id)
    if not selected_test:
        return redirect(url_for("dashboard"))
    session["active_test_id"] = test_id
    return render_template("exam.html", questions=selected_test["questions"], user=session["user"], test=selected_test)

@app.route("/submit_exam", methods=["POST"])
def submit_exam():
    if "user" not in session:
        return jsonify({"status": "error", "msg": "Not logged in"})

    data = request.get_json()
    user = session["user"]
    test_id = session.get("active_test_id")
    selected_test = TESTS.get(test_id)
    if not selected_test:
        return jsonify({"status": "error", "msg": "Select an assessment before submitting."}), 400
    questions = selected_test["questions"]

    behavior = {
        "time_per_question":   round(float(data.get("time_per_question", 30)), 2),
        "tab_switch_count":    int(data.get("tab_switch_count", 0)),
        "idle_time":           round(float(data.get("idle_time", 0)), 2),
        "answer_change_count": int(data.get("answer_change_count", 0)),
        "copy_paste_attempts": int(data.get("copy_paste_attempts", 0)),
        "head_movement_count": int(data.get("head_movement_count", 0)),
    }

    result = predict_behavior(behavior)

    answers = data.get("answers", {})
    text_answers = data.get("text_answers", {})
    violation_count = int(data.get("violation_count", 0))
    auto_submitted = bool(data.get("auto_submitted", False))

    # Score MCQ questions (exact match)
    correct = sum(1 for q in questions if q["type"] == "mcq" and answers.get(str(q["id"])) == q["answer"])

    # Score text questions (keyword matching — at least 2 keywords = 1 point)
    for q in questions:
        if q["type"] == "text":
            student_text = text_answers.get(str(q["id"]), "").lower()
            matched = sum(1 for kw in q["keywords"] if kw in student_text)
            if matched >= 2:
                correct += 1

    total = len(questions)

    record = {
        "student_email": user.get("email", "").lower(),
        "student_id":   user.get("roll", "N/A"),
        "student_name": f"{user['fname']} {user['lname']}",
        "test_id":      test_id,
        "test_name":    selected_test["name"],
        "submitted_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "score":        f"{correct}/{total}",
        "correct":      correct,
        "total":        total,
        **behavior,
        "violation_count": violation_count,
        "auto_submitted":  auto_submitted,
        "prediction":    result["prediction"],
        "anomaly_score": result["anomaly_score"],
        "label":         result["label"],
    }
    exam_records.append(record)
    session["exam_result"] = record
    session.pop("active_test_id", None)

    return jsonify({"status": "ok", "redirect": url_for("result")})

@app.route("/result")
def result():
    if "exam_result" not in session:
        return redirect(url_for("index"))
    return render_template("result.html", result=session["exam_result"])

@app.route("/admin")
def admin():
    if "user" not in session:
        return redirect(url_for("index"))
    return render_template("admin.html", user=session["user"])

@app.route("/api/students")
def api_students():
    return jsonify([
        {key: value for key, value in record.items() if key != "student_email"}
        for record in exam_records
    ])

# ─── Entry Point ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    ensure_model()
    print("\n" + "=" * 50)
    print("  ProctorAI Exam Monitoring System")
    print("  http://127.0.0.1:5000")
    print("=" * 50 + "\n")
    app.run(debug=True, host="127.0.0.1", port=5000)
