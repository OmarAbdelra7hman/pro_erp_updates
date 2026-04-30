import sys

def make_text(name, c_x, c_y, width, height, text, font="Arial, 10pt", horz="Right", color="Black"):
    left = c_y
    top = c_x + width
    # handle style inside font
    return f'      <TextObject Name="{name}" Left="{left}" Top="{top}" Width="{width}" Height="{height}" Text="{text}" HorzAlign="{horz}" VertAlign="Center" Font="{font}" TextColor="{color}" Angle="270" />'

lines = []
lines.append('<?xml version="1.0" encoding="utf-8"?>')
lines.append('<Report ScriptLanguage="CSharp" ReportInfo.Created="03/24/2026 12:30:00" ReportInfo.Modified="04/20/2026 20:00:00" ReportInfo.CreatorVersion="2026.1.8.0">')
lines.append('  <Dictionary>')
lines.append('    <BusinessObjectDataSource Name="Voucher" ReferenceName="Voucher" DataType="null" Enabled="true">')
lines.append('      <Column Name="Id" DataType="System.Int32"/>')
lines.append('      <Column Name="OperationDate" DataType="System.DateTime"/>')
lines.append('      <Column Name="Amount" DataType="System.Decimal"/>')
lines.append('      <Column Name="FromAccountName" DataType="System.String"/>')
lines.append('      <Column Name="ToAccountName" DataType="System.String"/>')
lines.append('      <Column Name="Notes" DataType="System.String"/>')
lines.append('      <Column Name="OperationTypeName" DataType="System.String"/>')
lines.append('      <Column Name="CreatedBy" DataType="System.String"/>')
lines.append('      <Column Name="CreatedAt" DataType="System.DateTime"/>')
lines.append('    </BusinessObjectDataSource>')
lines.append('    <Parameter Name="CompanyName" DataType="System.String"/>')
lines.append('    <Parameter Name="TaxNumber" DataType="System.String"/>')
lines.append('    <Parameter Name="ReportTitle" DataType="System.String"/>')
lines.append('    <Parameter Name="ContactInfo" DataType="System.String"/>')
lines.append('    <Parameter Name="VoucherType" DataType="System.String"/>')
lines.append('    <Parameter Name="Currency" DataType="System.String"/>')
lines.append('    <Parameter Name="PrintedBy" DataType="System.String"/>')
lines.append('  </Dictionary>')

# Page Width 78 means X max is 294, usable is 279
# We will use LeftMargin=0, RightMargin=0, so Width=294
lines.append('  <ReportPage Name="Page1" PaperWidth="78" UnlimitedHeight="true" LeftMargin="0" TopMargin="0" RightMargin="0" BottomMargin="0">')
lines.append('    <ReportTitleBand Name="ReportTitle1" Width="294.8" Height="600">')

# Cheque dimensions: X (Right to Left): 0 to 550, Y (Top to Bottom): 0 to 294

# LOGO
# PictureObject mapping: same math. Angle="270" on PictureObject?
# Let's see if Angle works on PictureObject. FastReport PictureObject HAS Angle property.
# Wait, let's just make it a Textbox if Logo is too hard, but wait, Logo is important.
# F_x = C_y, F_y = C_x + Width.
c_x_logo = 10
c_y_logo = 10
logo_w = 80
logo_h = 40
f_x_logo = c_y_logo
f_y_logo = c_x_logo + logo_w
lines.append(f'      <PictureObject Name="Logo" Left="{f_x_logo}" Top="{f_y_logo}" Width="{logo_w}" Height="{logo_h}" SizeMode="Zoom" Angle="270" />')

# HEADER
lines.append(make_text("txtCompanyName", 100, 10, 300, 25, "[CompanyName]", "Right", "Black").replace("TextObject", 'TextObject Font="Arial, 16pt, style=Bold"').replace('Font="Arial, 10pt" ', ''))
lines.append(make_text("txtTax", 100, 35, 300, 15, "الرقم الضريبي: [TaxNumber]"))

# TITLE
lines.append(make_text("txtReportTitle", 200, 60, 200, 30, "[ReportTitle]", "Center").replace("TextObject", 'TextObject Font="Arial, 18pt, style=Bold"').replace('Font="Arial, 10pt" ', ''))

# NUMBER & DATE
lines.append(make_text("lblVoucherNumber", 10, 100, 80, 20, "رقم السند:", "Right").replace("TextObject", 'TextObject Font="Arial, 11pt, style=Bold"').replace('Font="Arial, 10pt" ', ''))
lines.append(make_text("valVoucherNumber", 90, 100, 120, 20, "[Voucher.Id]", "Right"))

lines.append(make_text("lblVoucherDate", 250, 100, 80, 20, "التاريخ:", "Right").replace("TextObject", 'TextObject Font="Arial, 11pt, style=Bold"').replace('Font="Arial, 10pt" ', ''))
lines.append(make_text("valVoucherDate", 330, 100, 150, 20, "[Voucher.OperationDate]", "Right").replace("TextObject", 'TextObject Format="Date" Format.Format="yyyy/MM/dd"'))

# AMOUNT
lines.append(make_text("lblAmount", 10, 140, 100, 20, "مبلغ وقدره:", "Right").replace("TextObject", 'TextObject Font="Arial, 12pt, style=Bold"').replace('Font="Arial, 10pt" ', ''))
lines.append(make_text("valAmount", 110, 130, 300, 30, "[Voucher.Amount] [Currency]", "Right").replace("TextObject", 'TextObject Font="Arial, 16pt, style=Bold" Format="Number" Format.UseLocale="false" Format.DecimalDigits="2" Format.DecimalSeparator="." Format.GroupSeparator=","').replace('Font="Arial, 10pt" ', ''))

# FROM
lines.append(make_text("lblFrom", 10, 180, 100, 20, "من السيد / الحساب:", "Right").replace("TextObject", 'TextObject Font="Arial, 11pt, style=Bold"').replace('Font="Arial, 10pt" ', ''))
lines.append(make_text("valFrom", 110, 180, 400, 20, "[Voucher.FromAccountName]", "Right"))

# TO
lines.append(make_text("lblTo", 10, 210, 100, 20, "إلى الحساب:", "Right").replace("TextObject", 'TextObject Font="Arial, 11pt, style=Bold"').replace('Font="Arial, 10pt" ', ''))
lines.append(make_text("valTo", 110, 210, 400, 20, "[Voucher.ToAccountName]", "Right"))

# NOTES
lines.append(make_text("lblNotes", 10, 240, 100, 20, "وذلك عن قيمة:", "Right").replace("TextObject", 'TextObject Font="Arial, 11pt, style=Bold"').replace('Font="Arial, 10pt" ', ''))
lines.append(make_text("valNotes", 110, 240, 400, 40, "[Voucher.Notes]", "Right"))

# SIGNATURES
lines.append(make_text("txtSignLabel2", 50, 300, 200, 20, "توقيع المحاسب: .....................", "Center").replace("TextObject", 'TextObject Font="Arial, 12pt, style=Bold"').replace('Font="Arial, 10pt" ', ''))
lines.append(make_text("txtSignLabel1", 300, 300, 200, 20, "توقيع المستلم: .....................", "Center").replace("TextObject", 'TextObject Font="Arial, 12pt, style=Bold"').replace('Font="Arial, 10pt" ', ''))

lines.append('    </ReportTitleBand>')
lines.append('  </ReportPage>')
lines.append('</Report>')

with open('VoucherThermalReport.frx', 'w') as f:
    f.write('\n'.join(lines))
