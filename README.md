# ProctorAI

A simple exam monitoring system built to detect suspicious online exam behavior using webcam activity, browser interaction signals, and machine learning anomaly detection.

## Overview

This project simulates an online proctoring workflow where a student takes an exam while the system monitors:

- webcam presence and head movement
- tab switching
- idle time
- answer changes
- copy/paste attempts

The recorded behavior is passed through an Isolation Forest model to detect unusual activity and flag suspicious results.

## Features

- Student and examiner login flow
- Exam portal with MCQ and written questions
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
│   ├── login.html
│   ├── exam.html
│   ├── result.html
│   └── admin.html
├── static/
│   ├── style.css
│   └── script.js
├── users.json
├── model.pkl
├── scaler.pkl
├── dataset.csv
└── README.md
```

## Notes

- The ML model is trained automatically on first run.
- This project is designed for learning, portfolio presentation, and academic use.
- For GitHub publishing, push it using your own GitHub account and your own repository.

## License

This project is intended for personal and educational use.
