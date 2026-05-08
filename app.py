from flask import Flask, request, render_template, send_file, jsonify
from flask_talisman import Talisman
from flask_cors import CORS
from werkzeug.utils import secure_filename
from markupsafe import escape

import pandas as pd
import pytesseract
from PIL import Image
import docx
import PyPDF2
import json
import re
import psycopg2
import logging
import io

from reportlab.pdfgen import canvas

# =========================================================
# APP CONFIG
# =========================================================

app = Flask(__name__)

Talisman(app, content_security_policy=None)
CORS(app)

app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024

logging.basicConfig(level=logging.INFO)

# =========================================================
# DATABASE CONNECTION (FIXED)
# =========================================================

def get_db_connection():
    return psycopg2.connect(
        host="dpg-d7uqpt3eo5us73da3bcg-a.ohio-postgres.render.com",
        database="data_tool_db_7jog",
        user="data_tool_db_7jog_user",
        password="YOUR_RENDER_PASSWORD",  # replace this
        port=5432
    )

# =========================================================
# ALLOWED FILES
# =========================================================

ALLOWED_EXTENSIONS = {
    'pdf', 'png', 'jpg', 'jpeg',
    'csv', 'xls', 'xlsx',
    'txt', 'json', 'docx'
}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# =========================================================
# UTILITIES
# =========================================================

def clean_text(text):
    return re.sub(r'\s+', ' ', text).strip()

def extract_structured_data(text):
    emails = re.findall(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', text)
    dates = re.findall(r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}', text)
    money = re.findall(r'₹\s?\d+(?:,\d+)*(?:\.\d{2})?', text)

    return {
        "emails": emails or ["Not found"],
        "dates": dates or ["Not found"],
        "money": money or ["Not found"]
    }

# =========================================================
# FILE PROCESSORS
# =========================================================

def process_csv(file):
    df = pd.read_csv(file, encoding='utf-8', on_bad_lines='skip')
    return df.to_string()

def process_excel(file):
    df = pd.read_excel(file)
    return df.to_string()

def process_json(file):
    data = json.load(file)
    return json.dumps(data, indent=2)

def process_txt(file):
    return file.read().decode('utf-8', errors='ignore')

def process_pdf(file):
    reader = PyPDF2.PdfReader(file)
    text = ""
    for page in reader.pages:
        extracted = page.extract_text()
        if extracted:
            text += extracted + "\n"
    return text

def process_docx(file):
    doc = docx.Document(file)
    return "\n".join([p.text for p in doc.paragraphs])

def process_image(file):
    image = Image.open(file).convert('L')
    image = image.resize((image.width * 2, image.height * 2))
    return pytesseract.image_to_string(image, config='--oem 3 --psm 6')

# =========================================================
# HOME
# =========================================================

@app.route('/')
def home():
    return render_template('index.html')

# =========================================================
# UPLOAD + SAVE TO DB (FIXED)
# =========================================================

@app.route('/upload', methods=['POST'])
def upload():

    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Unsupported file type"}), 400

    filename = secure_filename(file.filename)
    file_type = filename.split('.')[-1]

    try:
        # process file
        if filename.endswith('.csv'):
            text = process_csv(file)
        elif filename.endswith(('.xls', '.xlsx')):
            text = process_excel(file)
        elif filename.endswith('.json'):
            text = process_json(file)
        elif filename.endswith('.txt'):
            text = process_txt(file)
        elif filename.endswith('.pdf'):
            text = process_pdf(file)
        elif filename.endswith('.docx'):
            text = process_docx(file)
        elif filename.endswith(('.png', '.jpg', '.jpeg')):
            text = process_image(file)
        else:
            return jsonify({"error": "Unsupported file"}), 400

        text = clean_text(text)
        structured = extract_structured_data(text)

        file.seek(0, 2)
        file_size = file.tell()
        file.seek(0)

        # DB INSERT
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO results (file_name, file_size, file_type, extracted_text, char_count)
            VALUES (%s, %s, %s, %s, %s)
        """, (filename, file_size, file_type, text, len(text)))

        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({
            "text": text,
            "characters": len(text),
            "words": len(text.split()),
            "emails": structured['emails'],
            "dates": structured['dates'],
            "money": structured['money']
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# =========================================================
# LIST HISTORY
# =========================================================

@app.route('/list_extractions')
def list_extractions():

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, file_name, file_size, file_type, char_count, created_at
            FROM results
            ORDER BY created_at DESC
        """)

        rows = cursor.fetchall()

        cursor.close()
        conn.close()

        result = []
        for row in rows:
            result.append({
                "id": row[0],
                "file_name": row[1],
                "file_size": row[2],
                "file_type": row[3],
                "char_count": row[4],
                "created_at": row[5].strftime("%Y-%m-%d %H:%M:%S") if row[5] else None
            })

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# =========================================================
# MAIN
# =========================================================

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
