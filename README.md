# ProctorAI — Online Assessment & Monitoring Demo

A student-facing online assessment demo with topic-based tests, an examiner dashboard, and transparent behavior monitoring. Students can choose a subject, complete a mixed-format assessment, and review their past attempts.

## Overview

After signing in, students see available tests and their completed attempts. During a selected assessment, the app records browser interaction and webcam-derived signals:

- webcam presence and head movement
- tab switching
- idle time
- answer changes
- copy/paste attempts

The recorded behavior is passed to an Isolation Forest model, which may flag unusual patterns for examiner review. These automated flags are demonstrative indicators, not proof of misconduct.

## Features

- Student and examiner login flow
- Responsive light and dark themes
- Student dashboard with available and attempted tests
- Four topic-based tests: Data Structures & Algorithms, Analytical Skills, Logical Reasoning, and Machine Learning Concepts
- Mixed multiple-choice and written questions
- webcam permission gate before exam starts
- violation tracking with automatic submission after repeated suspicious behavior
- ML-based anomaly detection
- dashboard for examiner review of student submissions

## Tech Stack

- Python
- Flask
- scikit-learn
- pandas
- numpy
- HTML, CSS, JavaScript

## Quick Start

### 1. Clone the project

```bash
git clone https://github.com/krish-2024/Proctor-AI.git
cd Proctor-AI
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Run the app

```bash
python app.py
```

Then open:

```text
http://127.0.0.1:5000
```

## Project Structure

```text
ProctorAI/
├── app.py
├── model.py
├── requirements.txt
├── templates/
│   ├── dashboard.html
│   ├── login.html
│   ├── exam.html
│   ├── result.html
│   └── admin.html
├── static/
│   ├── app-theme.css
│   ├── theme.js
│   ├── style.css
│   └── script.js
├── users.json
├── model.pkl
├── scaler.pkl
├── dataset.csv
└── README.md
```

## Notes

- The model is trained automatically on synthetic sample data. Its alerts are for demonstration only and do not establish that misconduct occurred.
- User accounts are stored locally in a JSON file and exam submissions are held in memory; records are not production-persistent.
- This project is for learning, portfolio presentation, and academic demonstration. Do not use it as the sole basis for academic decisions or for high-stakes exams.

## License

This project is intended for personal and educational use.
