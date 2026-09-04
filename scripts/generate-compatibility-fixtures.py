"""Generate only synthetic PDF regression inputs. Requires reportlab, pypdf, cryptography."""
from io import BytesIO
from pathlib import Path
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter

destination = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "compatibility"
destination.mkdir(parents=True, exist_ok=True)


def generate(pages):
    stream = BytesIO()
    drawing = canvas.Canvas(stream, pagesize=(420, 595), invariant=True)
    for index in range(pages):
        drawing.setFillColorRGB(0.1, 0.35, 0.5)
        drawing.rect(30, 320, 310, 160, fill=1)
        drawing.setFillColorRGB(0, 0, 0)
        drawing.setFont("Helvetica", 20)
        drawing.drawString(30, 510, f"SYNTHETIC PAGE {index + 1}")
        drawing.setFont("Helvetica", 12)
        drawing.drawString(30, 285, "No personal or financial information.")
        drawing.showPage()
    drawing.save()
    writer = PdfWriter()
    for index, page in enumerate(PdfReader(stream).pages):
        if index % 3 == 1:
            page.rotate(90)
        writer.add_page(page)
    return writer


for filename, count, password in [
    ("normal.pdf", 3, None),
    ("protected.pdf", 3, ""),
    ("password.pdf", 3, "synthetic-opening-password"),
    ("multipage.pdf", 12, ""),
]:
    writer = generate(count)
    if password is not None:
        writer.encrypt(password, owner_password="synthetic-owner-password", algorithm="AES-256")
    writer.write(destination / filename)
