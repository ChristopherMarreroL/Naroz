"""Synthetic-only link regression PDFs; requires reportlab, pypdf, cryptography."""
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import FloatObject, NameObject
from reportlab.pdfgen import canvas

destination = Path(__file__).resolve().parent.parent / "tests/fixtures/links"
destination.mkdir(parents=True, exist_ok=True)
stream = BytesIO()
drawing = canvas.Canvas(stream, pagesize=(420, 595), invariant=True)
for index in range(4):
    drawing.setFont("Helvetica", 12)
    drawing.drawString(50, 500, f"https://example.org/page-{index + 1}")
    drawing.drawString(50, 460, "www.example.org/account")
    drawing.drawString(50, 420, "Open the synthetic portal")
    drawing.linkURL(f"https://example.org/explicit-{index + 1}", (50, 417, 220, 435), relative=0)
    drawing.drawString(50, 380, "Unsafe action must not survive normalization")
    drawing.linkURL("javascript:alert(1)", (50, 377, 300, 395), relative=0)
    drawing.showPage()
drawing.save()

for protected in (False, True):
    writer = PdfWriter()
    for index, page in enumerate(PdfReader(BytesIO(stream.getvalue())).pages):
        page.rotate(index * 90)
        page.cropbox.lower_left = (20, 30)
        page.cropbox.upper_right = (400, 570)
        if index == 3:
            page[NameObject("/UserUnit")] = FloatObject(1.5)
        writer.add_page(page)
    if protected:
        writer.encrypt("", owner_password="synthetic-only-owner", algorithm="AES-256")
    writer.write(destination / ("protected-links.pdf" if protected else "normal-links.pdf"))
