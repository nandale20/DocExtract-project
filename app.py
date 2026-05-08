from flask import Flask, request, render_template, send_file, jsonify
from flask_talisman import Talisman
from flask_cors import CORS
from werkzeug.utils import secure_filename

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

app = Flask(__name__)

Talisman(app, content_security_policy=None)
CORS(app)

app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024

logging.basicConfig(level=logging.INFO)

# ================= DB =================

def get_db_connection():
    return psycopg2.connect(
        host="dpg-d7uqpt3eo5us73da3bcg-a.ohio-postgres.render.com",
        database="data_tool_db_7jog",
        user="data_tool_db_7jog_user",
        password="YOUR_PASSWORD_HERE",
        port=5432
    )

# ================= FILE SUPPORT =================

ALLOWED_EXTENSIONS = {
    'pdf','png','jpg','jpeg','csv','xls','xlsx','txt','json','docx'
}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.',1)[1].lower() in ALLOWED_EXTENSIONS

# ================= UTIL =================

def clean_text(text):
    return re.sub(r'\s+', ' ', text).strip()

def extract_structured_data(text):
    return {
        "emails": re.findall(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', text),
        "dates": re.findall(r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}', text),
        "money": re.findall(r'₹\s?\d+(?:,\d+)*(?:\.\d{2})?', text)
    }

# ================= PROCESSORS =================

def process_pdf(file):
    reader = PyPDF2.PdfReader(file)
    text = ""
    for page in reader.pages:
        if page.extract_text():
            text += page.extract_text() + "\n"
    return text

def process_image(file):
    img = Image.open(file).convert("L")
    return pytesseract.image_to_string(img)

def process_txt(file):
    return file.read().decode("utf-8", errors="ignore")

def process_json(file):
    return json.dumps(json.load(file), indent=2)

def process_csv(file):
    return pd.read_csv(file, on_bad_lines="skip").to_string()

def process_excel(file):
    return pd.read_excel(file).to_string()

def process_docx(file):
    doc = docx.Document(file)
    return "\n".join([p.text for p in doc.paragraphs])

# ================= ROUTES =================

@app.route("/")
def home():
    return render_template("index.html")

# ================= UPLOAD =================

@app.route("/upload", methods=["POST"])
def upload():

    if "file" not in request.files:
        return jsonify({"error": "No file"}), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({"error": "No filename"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Not allowed"}), 400

    filename = secure_filename(file.filename)
    ext = filename.split(".")[-1].lower()

    try:
        if ext == "pdf":
            text = process_pdf(file)
        elif ext in ["png","jpg","jpeg"]:
            text = process_image(file)
        elif ext == "txt":
            text = process_txt(file)
        elif ext == "json":
            text = process_json(file)
        elif ext == "csv":
            text = process_csv(file)
        elif ext in ["xls","xlsx"]:
            text = process_excel(file)
        elif ext == "docx":
            text = process_docx(file)
        else:
            return jsonify({"error":"Unsupported"}), 400

        text = clean_text(text)
        structured = extract_structured_data(text)

        file.seek(0,2)
        size = file.tell()

        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            INSERT INTO results(file_name,file_size,file_type,extracted_text,char_count)
            VALUES(%s,%s,%s,%s,%s)
        """, (filename, size, ext, text, len(text)))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({
            "text": text,
            "characters": len(text),
            "words": len(text.split()),
            "emails": structured["emails"],
            "dates": structured["dates"],
            "money": structured["money"]
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ================= HISTORY =================

@app.route("/list_extractions")
def list_extractions():
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT id,file_name,file_size,file_type,char_count,created_at
            FROM results
            ORDER BY created_at DESC
        """)

        rows = cur.fetchall()

        cur.close()
        conn.close()

        return jsonify([
            {
                "id": r[0],
                "file_name": r[1],
                "file_size": r[2],
                "file_type": r[3],
                "char_count": r[4],
                "created_at": str(r[5])
            } for r in rows
        ])

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ================= DOWNLOAD PDF =================

@app.route("/download", methods=["POST"])
def download():

    data = request.json
    text = data.get("text","")
    analysis = data.get("analysis",{})

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer)

    y = 800
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(40,y,"DocExtract Report")

    y -= 40
    pdf.setFont("Helvetica", 12)

    for key in ["emails","dates","money","phones"]:
        items = analysis.get(key,[])
        pdf.drawString(40,y,f"{key.upper()}: {len(items)}")
        y -= 20

    y -= 20
    pdf.drawString(40,y,"Extracted Text:")
    y -= 20

    for line in text.split("\n"):
        pdf.drawString(40,y,line[:100])
        y -= 15
        if y < 50:
            pdf.showPage()
            y = 800

    pdf.save()
    buffer.seek(0)

    return send_file(buffer,
        as_attachment=True,
        download_name="report.pdf",
        mimetype="application/pdf"
    )

# ================= RUN =================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
