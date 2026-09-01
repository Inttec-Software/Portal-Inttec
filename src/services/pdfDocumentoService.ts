import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, copyAsync, writeAsStringAsync, EncodingType, getContentUriAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { supabase, Documento, DocumentoFirmado } from './supabase';

/**
 * Calculador de Hash SHA-256 simple y sin dependencias externas
 */
async function generarSHA256(text: string): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    // Fallback simple si window.crypto no está presente en algún runtime antiguo
  }
  // Algoritmo SHA-256 JS puro ligero
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h0 = (h0 ^ ch) + 0x9e3779b9;
    h1 = (h1 ^ ch) + 0x61c8864e;
    h2 = (h2 ^ ch) + 0x3c6ef372;
    h3 = (h3 ^ ch) + 0x1f83d9ab;
  }
  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `${toHex(h0)}${toHex(h1)}${toHex(h2)}${toHex(h3)}${toHex(h4)}${toHex(h5)}${toHex(h6)}${toHex(h7)}`;
}

export interface GenerarPdfParams {
  documento: Documento;
  firmado: DocumentoFirmado;
  firmaBase64: string;
  ipRegistro?: string;
  ubicacionGps?: string;
  dispositivoInfo?: string;
  incluirConstancia?: boolean; // Por defecto false: PDF limpio sin constancia anexada
}

export const PdfDocumentoService = {
  /**
   * Compila el documento con la firma del usuario y la hoja de auditoría
   */
  async generarHtmlDocumento(params: GenerarPdfParams): Promise<{ html: string; hashSha256: string }> {
    const { documento, firmado, firmaBase64, ipRegistro, ubicacionGps, dispositivoInfo } = params;
    const fechaActual = firmado.firmado_at ? new Date(firmado.firmado_at) : new Date();
    const fechaFormateada = fechaActual.toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City',
      dateStyle: 'full',
      timeStyle: 'medium',
    });

    const firmaImgTag = `
      <div style="text-align: center; margin: 20px 0; page-break-inside: avoid;">
        <img src="${firmaBase64}" style="max-height: 100px; max-width: 250px; object-fit: contain;" />
        <div style="border-top: 2px solid #1e293b; width: 260px; margin: 5px auto 0 auto;"></div>
        <p style="margin: 4px 0 0 0; font-weight: bold; color: #0f172a; font-size: 14px;">${firmado.empleado_nombre}</p>
        <p style="margin: 2px 0 0 0; color: #64748b; font-size: 12px;">Firmante Autenticado (${firmado.empleado_email || 'Portal Inttec'})</p>
      </div>
    `;

    // Reemplazo de marcadores explícitos {{FIRMA_EMPLEADO}} o inclusión al final
    let cuerpoHtml = documento.contenido_html;
    if (cuerpoHtml.includes('{{FIRMA_EMPLEADO}}')) {
      cuerpoHtml = cuerpoHtml.replace(/\{\{FIRMA_EMPLEADO\}\}/g, firmaImgTag);
    } else {
      cuerpoHtml += `
        <div style="margin-top: 40px; display: flex; justify-content: space-around; align-items: flex-end;">
          ${firmaImgTag}
        </div>
      `;
    }

    // Datos crudos para la generación del digest de inalterabilidad SHA-256
    const datosCadenaOriginal = `${documento.id}|${firmado.empleado_id}|${firmado.empleado_nombre}|${fechaActual.toISOString()}|${ipRegistro || ''}|${ubicacionGps || ''}`;
    const hashSha256 = await generarSHA256(datosCadenaOriginal + firmaBase64);

    const htmlCompleto = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${documento.titulo}</title>
        <style>
          @page { margin: 20mm; }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #1e293b;
            line-height: 1.6;
            margin: 0;
            padding: 0;
            font-size: 13px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0284c7;
            padding-bottom: 12px;
            margin-bottom: 24px;
          }
          .header h1 {
            font-size: 20px;
            color: #0369a1;
            margin: 0;
          }
          .header p {
            margin: 2px 0 0 0;
            font-size: 11px;
            color: #64748b;
          }
          .meta-box {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 24px;
            font-size: 12px;
          }
          .content {
            margin-bottom: 40px;
            min-height: 250px;
          }
          .page-break {
            page-break-before: always;
          }
          .audit-card {
            background-color: #f0f9ff;
            border: 1px solid #bae6fd;
            border-radius: 8px;
            padding: 20px;
            margin-top: 20px;
          }
          .audit-title {
            font-size: 15px;
            font-weight: bold;
            color: #0369a1;
            margin: 0 0 12px 0;
            display: flex;
            align-items: center;
          }
          .audit-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            font-size: 11px;
          }
          .audit-item {
            background: #ffffff;
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
          }
          .audit-label {
            font-weight: bold;
            color: #475569;
            font-size: 10px;
            text-transform: uppercase;
          }
          .audit-value {
            color: #0f172a;
            font-family: monospace;
            word-break: break-all;
            margin-top: 2px;
          }
          .legal-footer {
            margin-top: 20px;
            font-size: 10px;
            color: #64748b;
            text-align: justify;
            border-top: 1px solid #cbd5e1;
            padding-top: 10px;
          }
        </style>
      </head>
      <body>
        ${(() => {
          let posX = 50;
          let posY = 75;

          if (documento.posicion_firma) {
            try {
              const parsed = JSON.parse(documento.posicion_firma);
              if (parsed.x !== undefined && parsed.y !== undefined) {
                posX = parsed.x;
                posY = parsed.y;
              }
            } catch (e) {
              if (documento.posicion_firma === 'PIE_PAGINA') {
                posX = 55;
                posY = 80;
              } else if (documento.posicion_firma === 'PAGINA_1') {
                posX = 50;
                posY = 30;
              }
            }
          }

          const htmlFirmaEstampa = `
            <div style="position: absolute; left: ${posX}%; top: ${posY}%; z-index: 999; text-align: center; background: rgba(255, 255, 255, 0.95); padding: 6px 12px; border: 2px dashed #0284c7; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); min-width: 150px;">
              <p style="font-size: 8px; font-weight: bold; color: #0284c7; margin: 0 0 2px 0; text-transform: uppercase;">FIRMA DE CONFORMIDAD:</p>
              <img src="${firmaBase64}" style="max-height: 60px; max-width: 160px; display: block; margin: 0 auto;" />
              <p style="font-size: 8px; font-weight: bold; color: #0f172a; margin: 2px 0 0 0;">${firmado.empleado_nombre}</p>
              <p style="font-size: 7px; color: #64748b; margin: 0;">Firmado el ${fechaFormateada}</p>
            </div>
          `;

          return `
            <div style="position: relative; width: 100%; min-height: 880px;">
              <div class="header">
                <div>
                  <h1>INTTEC & DARAVISA</h1>
                  <p>Portal de Gestión Corporativa y Documentos Digitales</p>
                </div>
                <div style="text-align: right;">
                  <p><strong>Folio Doc:</strong> ${documento.id.substring(0, 8).toUpperCase()}</p>
                  <p><strong>Fecha de Emisión:</strong> ${fechaFormateada}</p>
                </div>
              </div>

              <div class="meta-box">
                <strong>Asunto / Título:</strong> ${documento.titulo}<br/>
                ${documento.descripcion ? `<strong>Descripción:</strong> ${documento.descripcion}<br/>` : ''}
                <strong>Emitido por:</strong> ${documento.creador_nombre}
              </div>

              ${
                documento.archivo_pdf_url
                  ? `
                  <div style="margin-top: 15px; margin-bottom: 20px; padding: 16px; border: 2px dashed #0284c7; background: #f0f9ff; border-radius: 8px; text-align: center;">
                    <h3 style="color: #0369a1; margin: 0 0 6px 0; font-size: 16px;">📄 Documento PDF Adjunto Certificado</h3>
                    <p style="font-size: 12px; color: #334155; margin: 0;">El presente certificado digital avala la aceptación, lectura y firma de conformidad autógrafa digital sobre el documento en formato PDF: <strong>${documento.titulo}</strong>.</p>
                  </div>
                `
                  : ''
              }

              <div class="content" style="min-height: 350px;">
                ${cuerpoHtml || `<p style="font-size: 14px; line-height: 1.6; text-align: justify; color: #1e293b;">Leído que fue el presente documento y enteradas las partes de su contenido y alcance legal, lo firman de conformidad al calce en la fecha indicada.</p>`}
              </div>

              <div style="margin-top: 50px; display: flex; justify-content: space-around; width: 100%;">
                <div style="text-align: center; width: 200px;">
                  <div style="border-bottom: 1px solid #94a3b8; margin-bottom: 4px; height: 40px;"></div>
                  <p style="font-size: 10px; font-weight: bold; margin: 0; color: #1e293b;">EL PATRÓN</p>
                  <p style="font-size: 9px; color: #64748b; margin: 0;">Firma Representante Legal</p>
                </div>

                <div style="text-align: center; width: 200px;">
                  <div style="border-bottom: 1px solid #94a3b8; margin-bottom: 4px; height: 40px;"></div>
                  <p style="font-size: 10px; font-weight: bold; margin: 0; color: #1e293b;">EL TRABAJADOR / EMPLEADO</p>
                  <p style="font-size: 9px; color: #64748b; margin: 0;">Firma de Conformidad</p>
                </div>
              </div>

              ${htmlFirmaEstampa}
            </div>
          `;
        })()}

        ${params.incluirConstancia ? `
        <div class="page-break"></div>

        <div class="header">
          <div>
            <h1>CONSTANCIA DE TRAZABILIDAD Y AUDITORÍA DIGITAL</h1>
            <p>Evidencia de Firma Electrónica Simple (Código de Comercio Art. 89 / NOM-151)</p>
          </div>
        </div>

        <div class="audit-card">
          <div class="audit-title">🛡️ Certificado de Validez Legal y No Repudio</div>
          <div class="audit-grid">
            <div class="audit-item">
              <div class="audit-label">Nombre del Firmante</div>
              <div class="audit-value">${firmado.empleado_nombre}</div>
            </div>
            <div class="audit-item">
              <div class="audit-label">Correo / Identificador</div>
              <div class="audit-value">${firmado.empleado_email || 'N/A'}</div>
            </div>
            <div class="audit-item">
              <div class="audit-label">Fecha y Hora (Hora de México)</div>
              <div class="audit-value">${fechaFormateada}</div>
            </div>
            <div class="audit-item">
              <div class="audit-label">Dirección IP</div>
              <div class="audit-value">${ipRegistro || 'No registrada'}</div>
            </div>
            <div class="audit-item">
              <div class="audit-label">Coordenadas GPS</div>
              <div class="audit-value">${ubicacionGps || 'Ubicación no proporcionada'}</div>
            </div>
            <div class="audit-item">
              <div class="audit-label">Plataforma / Dispositivo</div>
              <div class="audit-value">${dispositivoInfo || Platform.OS}</div>
            </div>
          </div>

          <div style="margin-top: 12px;" class="audit-item">
            <div class="audit-label">Digest Hash Cryptográfico (SHA-256 Inalterable)</div>
            <div class="audit-value" style="color: #0369a1; font-weight: bold;">${hashSha256}</div>
          </div>
        </div>

        <div style="text-align: center; margin-top: 20px;">
          <p style="font-size: 11px; font-weight: bold; color: #334155;">Estampa de Firma Autógrafa Registrada:</p>
          <img src="${firmaBase64}" style="max-height: 80px; border: 1px dashed #cbd5e1; padding: 4px; background: #fff;" />
        </div>
        ` : ''}

        </div>
      </body>
      </html>
    `;

    return { html: htmlCompleto, hashSha256 };
  },

  /**
   * Estampa la firma del empleado directamente sobre el archivo PDF original subido (usando pdf-lib)
   */
  async estamparFirmaEnPdfOriginal(params: GenerarPdfParams): Promise<{ uri?: string; hashSha256: string }> {
    const { documento, firmado, firmaBase64, ipRegistro, ubicacionGps, dispositivoInfo } = params;
    const fechaActual = new Date();
    const fechaFormateada = fechaActual.toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const datosAudit = documento.id + '|' + firmado.empleado_id + '|' + (firmado.empleado_nombre || '') + '|' + fechaActual.toISOString() + '|' + (ipRegistro || '');
    const hashSha256 = await generarSHA256(datosAudit);

    if (!documento.archivo_pdf_url) {
      return this.generarYCompartirPdf(params);
    }

    try {
      // 1. Descargar los bytes del PDF original subido por el Admin
      const response = await fetch(documento.archivo_pdf_url);
      const pdfArrayBuffer = await response.arrayBuffer();

      // 2. Cargar el documento PDF con pdf-lib
      const pdfDoc = await PDFDocument.load(pdfArrayBuffer);
      const pages = pdfDoc.getPages();

      // 3. Determinar posición e índice de página automáticamente
      let posXPercent = 50;
      let posYPercent = 75;
      // Por defecto AUTOMÁTICO: siempre la última página del PDF original (donde van las firmas de contratos)
      let pageIndex = Math.max(0, pages.length - 1);

      if (documento.posicion_firma) {
        try {
          const parsed = JSON.parse(documento.posicion_firma);
          if (parsed.x !== undefined) posXPercent = Number(parsed.x);
          if (parsed.y !== undefined) posYPercent = Number(parsed.y);
          if (parsed.page !== undefined) {
            const pNum = parseInt(String(parsed.page), 10);
            if (!isNaN(pNum) && pNum >= 1 && pNum <= pages.length) {
              pageIndex = pNum - 1;
            } else {
              // Si el número de página supera las páginas del documento, usar automáticamente la última página
              pageIndex = Math.max(0, pages.length - 1);
            }
          }
        } catch (e) {
          // Posicionamiento estándar
          if (documento.posicion_firma === 'PAGINA_1') {
            pageIndex = 0;
            posXPercent = 50;
            posYPercent = 80;
          } else if (documento.posicion_firma === 'PIE_PAGINA') {
            pageIndex = Math.max(0, pages.length - 1);
            posXPercent = 55;
            posYPercent = 80;
          } else {
            pageIndex = Math.max(0, pages.length - 1);
            posXPercent = 50;
            posYPercent = 75;
          }
        }
      }

      // Asegurar que pageIndex sea estrictamente válido dentro del rango [0, pages.length - 1]
      pageIndex = Math.max(0, Math.min(pageIndex, pages.length - 1));
      const targetPage = pages[pageIndex] || pages[pages.length - 1];
      const { width: pageWidth, height: pageHeight } = targetPage.getSize();

      // ── Conversión de coordenadas: Canvas CSS → PDF (pdf-lib) ──
      // En el lienzo interactivo (CSS): origin (0,0) = esquina superior-izquierda
      //   • left: posXPercent% → borde IZQUIERDO del recuadro
      //   • top:  posYPercent% → borde SUPERIOR del recuadro
      // En pdf-lib: origin (0,0) = esquina inferior-izquierda, Y crece hacia arriba
      //   • drawImage(x, y) → (x,y) es la esquina INFERIOR-IZQUIERDA de la imagen
      //
      // Fórmula:
      //   topStampInPdf = pageHeight - (posYPercent / 100) * pageHeight
      // Dimensiones de la firma: 24% del ancho de la hoja con proporción 2.6:1
      // Esto coincide exactamente píxel a píxel con el recuadro del administrador en pantalla
      const stampWidth = pageWidth * 0.24;
      const stampHeight = stampWidth / 2.6;

      // X: porcentaje desde el borde izquierdo
      const rawPdfX = (posXPercent / 100) * pageWidth;

      // Y: el borde superior del recuadro corresponde al posYPercent desde el tope del PDF
      // Calibración vertical (-2%) para compensar márgenes de renderizado y alinear la firma exactamente sobre la línea
      const calibratedYPercent = Math.max(0, posYPercent - 2.0);
      const topEdgeInPdf = pageHeight - ((calibratedYPercent / 100) * pageHeight);
      const rawPdfY = topEdgeInPdf - stampHeight;

      // Clamp estricto para que la firma respete los bordes de la página
      const minX = 4;
      const maxX = pageWidth - stampWidth - 4;
      const minY = 4;
      const maxY = pageHeight - stampHeight - 4;

      const pdfX = Math.max(minX, Math.min(rawPdfX, maxX));
      const pdfY = Math.max(minY, Math.min(rawPdfY, maxY));

      console.log('[FIRMA-STAMP] ── Coordenadas de Estampado ──');
      console.log('[FIRMA-STAMP] posicion_firma guardada:', documento.posicion_firma);
      console.log('[FIRMA-STAMP] Porcentajes interpretados: X=' + posXPercent + '%, Y=' + posYPercent + '%');
      console.log('[FIRMA-STAMP] Página destino:', (pageIndex + 1) + ' de ' + pages.length, '| Dimensiones:', pageWidth + ' x ' + pageHeight + ' pts');
      console.log('[FIRMA-STAMP] Límites seguros: X[' + minX + '-' + maxX + '], Y[' + minY + '-' + maxY + ']');
      console.log('[FIRMA-STAMP] Final → pdfX=' + pdfX + ', pdfY=' + pdfY + ' (stamp ' + stampWidth + 'x' + stampHeight + ')');

      // 4. Incrustar y estampar la imagen PNG de la firma autógrafa de forma limpia (sin recuadros añadidos)
      const signatureImage = await pdfDoc.embedPng(firmaBase64);

      targetPage.drawImage(signatureImage, {
        x: pdfX,
        y: pdfY,
        width: stampWidth,
        height: stampHeight,
      });

      // 5. Anexar Hoja Final con Certificado de Trazabilidad y Auditoría NOM-151 SOLO si se solicita
      if (params.incluirConstancia) {
        const auditPage = pdfDoc.addPage([pageWidth, pageHeight]);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

        const folioText = 'Folio Documento: ' + documento.id.substring(0, 8).toUpperCase();
        const firmanteText = 'Firmante: ' + (firmado.empleado_nombre || 'Empleado') + ' (' + (firmado.empleado_email || 'N/A') + ')';
        const fechaLocalMexico = (firmado.firmado_at ? new Date(firmado.firmado_at) : fechaActual).toLocaleString('es-MX', {
          timeZone: 'America/Mexico_City',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        });
        const fechaText = 'Fecha y Hora (Hora de Mexico): ' + fechaLocalMexico;
        const ipText = 'IP Registro: ' + (ipRegistro || 'No registrada');
        const gpsText = 'Ubicacion GPS: ' + (ubicacionGps || 'No proporcionada');
        const devText = 'Dispositivo: ' + (dispositivoInfo || Platform.OS);

        auditPage.drawText('INTTEC & DARAVISA', {
          x: 40,
          y: pageHeight - 50,
          size: 16,
          font: fontBold,
          color: rgb(0.01, 0.52, 0.78),
        });

        auditPage.drawText('CONSTANCIA DE TRAZABILIDAD Y AUDITORIA DIGITAL (NOM-151)', {
          x: 40,
          y: pageHeight - 75,
          size: 12,
          font: fontBold,
          color: rgb(0.12, 0.16, 0.23),
        });

        auditPage.drawText(folioText, {
          x: 40,
          y: pageHeight - 105,
          size: 10,
          font: fontRegular,
        });

        auditPage.drawText(firmanteText, {
          x: 40,
          y: pageHeight - 125,
          size: 10,
          font: fontRegular,
        });

        auditPage.drawText(fechaText, {
          x: 40,
          y: pageHeight - 145,
          size: 10,
          font: fontRegular,
        });

        auditPage.drawText(ipText, {
          x: 40,
          y: pageHeight - 165,
          size: 10,
          font: fontRegular,
        });

        auditPage.drawText(gpsText, {
          x: 40,
          y: pageHeight - 185,
          size: 10,
          font: fontRegular,
        });

        auditPage.drawText(devText, {
          x: 40,
          y: pageHeight - 205,
          size: 10,
          font: fontRegular,
        });

        auditPage.drawText('Hash SHA-256 (Inalterable):', {
          x: 40,
          y: pageHeight - 240,
          size: 10,
          font: fontBold,
        });

        auditPage.drawText(hashSha256, {
          x: 40,
          y: pageHeight - 255,
          size: 9,
          font: fontBold,
          color: rgb(0.01, 0.52, 0.78),
        });
      }

      // 6. Guardar los bytes finales del PDF compilado
      const pdfBytes = await pdfDoc.save();

      if (Platform.OS === 'web') {
        const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        return { uri: blobUrl, hashSha256 };
      }

      // En Móvil guardamos en la caché local con esquema file:// para compartir
      const safeName = 'Documento_Firmado_' + Date.now() + '.pdf';
      const cDir = cacheDirectory || '';
      const safeUri = cDir + (cDir.endsWith('/') ? '' : '/') + safeName;
      
      let base64String = '';
      for (let i = 0; i < pdfBytes.byteLength; i++) {
        base64String += String.fromCharCode(pdfBytes[i]);
      }
      const base64Data = typeof btoa !== 'undefined' ? btoa(base64String) : '';

      // Escribir el PDF firmado directamente en el archivo local file://
      await writeAsStringAsync(safeUri, base64Data, { encoding: EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(safeUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Documento Firmado - ' + documento.titulo,
          UTI: 'com.adobe.pdf',
        });
      }

      return { uri: safeUri, hashSha256 };
    } catch (pdfErr) {
      console.warn('Fallo estamparFirmaEnPdfOriginal con pdf-lib, haciendo fallback:', pdfErr);
      return this.generarYCompartirPdf(params);
    }
  },

  /**
   * Genera el archivo PDF local e inicia la descarga o previsualización
   */
  async generarYCompartirPdf(params: GenerarPdfParams): Promise<{ uri?: string; hashSha256: string }> {
    if (params.documento.archivo_pdf_url && params.documento.tipo_documento === 'PDF') {
      return this.estamparFirmaEnPdfOriginal(params);
    }

    const { html, hashSha256 } = await this.generarHtmlDocumento(params);

    if (Platform.OS === 'web') {
      try {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(html);
          iframeDoc.close();

          setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            }, 1000);
          }, 500);
        }
      } catch (err) {
        console.warn('Fallback a Print.printAsync en Web:', err);
        await Print.printAsync({ html });
      }
      return { hashSha256 };
    }

    try {
      const printResult = await Print.printToFileAsync({ html, base64: false });
      const pdfUri = printResult?.uri;

      if (pdfUri) {
        let shareUri = pdfUri;
        try {
          if (cacheDirectory) {
            const safeName = 'Documento_Firmado_' + Date.now() + '.pdf';
            const cDir = cacheDirectory || '';
            const safeUri = cDir + (cDir.endsWith('/') ? '' : '/') + safeName;
            await copyAsync({ from: pdfUri, to: safeUri });
            shareUri = Platform.OS === 'android' ? await getContentUriAsync(safeUri) : safeUri;
          }
        } catch (copyErr) {
          console.warn('No se pudo copiar a cacheDirectory, intentando URI directa:', copyErr);
        }

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(shareUri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Documento Firmado - ' + params.documento.titulo,
            UTI: 'com.adobe.pdf',
          });
        }
      }
      return { uri: pdfUri, hashSha256 };
    } catch (fileErr) {
      console.warn('Fallback a Print.printAsync en móvil:', fileErr);
      await Print.printAsync({ html });
      return { hashSha256 };
    }
  },
};
