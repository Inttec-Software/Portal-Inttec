import { cacheDirectory, copyAsync, getContentUriAsync } from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { Evidencia } from '../services/supabase';
import { LOGO_BASE64 } from './logoBase64';

const parseMarkdownToHtml = (markdown: string): string => {
  if (!markdown) return '';
  let html = markdown;
  
  // Escapar HTML básico por seguridad
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
    
  // Bold: **text** -> <strong>text</strong>
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Bullets: \n- item or \n* item -> <li>item</li>
  html = html.replace(/\r\n/g, '\n');
  const lines = html.split('\n');
  let inList = false;
  const processedLines = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('•')) {
      const content = trimmed.substring(1).trim();
      let prefix = '';
      if (!inList) {
        inList = true;
        prefix = '<ul style="margin: 4px 0; padding-left: 20px;">';
      }
      return `${prefix}<li>${content}</li>`;
    } else {
      let suffix = '';
      if (inList) {
        inList = false;
        suffix = '</ul>';
      }
      return `${suffix}<p style="margin: 4px 0;">${trimmed}</p>`;
    }
  });
  
  let finalHtml = processedLines.join('\n');
  if (inList) {
    finalHtml += '</ul>';
  }
  
  // Limpiar párrafos vacíos
  finalHtml = finalHtml.replace(/<p style="margin: 4px 0;"><\/p>/g, '');
  
  return finalHtml;
};

export const EvidenceReportGenerator = {
  async exportToPDF(
    evidencia: Omit<Evidencia, 'id'> & { id?: string },
    antesBase64: string | null,
    despuesBase64: string | null,
    userName: string,
    fotosAdicionales: string[] = []
  ): Promise<void> {
    const fecha = evidencia.created_at
      ? new Date(evidencia.created_at).toLocaleString('es-MX')
      : new Date().toLocaleString('es-MX');

    // Preparar imágenes para incrustar en HTML (soporta URL remota y Base64)
    const antesImgSrc = antesBase64
      ? (antesBase64.startsWith('data:') || antesBase64.startsWith('http') ? antesBase64 : `data:image/jpeg;base64,${antesBase64}`)
      : null;
    const despuesImgSrc = despuesBase64
      ? (despuesBase64.startsWith('data:') || despuesBase64.startsWith('http') ? despuesBase64 : `data:image/jpeg;base64,${despuesBase64}`)
      : null;

    let fotosHtml = '';

    let fotosAdicionalesHtml = '';
    if (fotosAdicionales && fotosAdicionales.length > 0) {
      fotosAdicionales.forEach((foto, index) => {
        if (!foto) return;
        const imgSrc = foto.startsWith('data:') || foto.startsWith('http') 
          ? foto 
          : `data:image/jpeg;base64,${foto}`;
        
        fotosAdicionalesHtml += `
          <div style="page-break-before: always; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 98vh; page-break-inside: avoid; text-align: center; box-sizing: border-box; padding: 20px;">
            <div style="font-size: 12px; font-weight: bold; color: #1a365d; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.5px;">Foto Adicional #${index + 1}</div>
            <div style="flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; max-height: 85vh; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; box-sizing: border-box;">
              <img src="${imgSrc}" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px;" />
            </div>
            <div style="margin-top: 15px; font-size: 8px; color: #a0aec0; letter-spacing: 0.5px;">
              Reporte de Evidencias INTTEC - Anexo Fotográfico Adicional
            </div>
          </div>
        `;
      });
    }

    if (antesImgSrc || despuesImgSrc) {
      fotosHtml = `
        <div class="section-title">Registro Fotográfico de Evidencia</div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; border: none;">
          <tr>
            ${antesImgSrc ? `
              <td style="width: 50%; padding: 0 10px 0 0; vertical-align: top; border: none;">
                <div class="evidence-card" style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background-color: #f7fafc;">
                  <div class="card-header antes" style="font-size: 10px; font-weight: 800; text-align: center; padding: 4px; color: #ffffff; background-color: #e53e3e;">ESTADO ANTES</div>
                  <div class="image-wrapper" style="height: 180px; display: flex; align-items: center; justify-content: center; background-color: #edf2f7; padding: 8px;">
                    <img src="${antesImgSrc}" alt="Antes del trabajo" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px;" />
                  </div>
                </div>
              </td>
            ` : ''}
            ${despuesImgSrc ? `
              <td style="width: 50%; padding: 0 0 0 10px; vertical-align: top; border: none;">
                <div class="evidence-card" style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background-color: #f7fafc;">
                  <div class="card-header despues" style="font-size: 10px; font-weight: 800; text-align: center; padding: 4px; color: #ffffff; background-color: #38a169;">ESTADO DESPUÉS</div>
                  <div class="image-wrapper" style="height: 180px; display: flex; align-items: center; justify-content: center; background-color: #edf2f7; padding: 8px;">
                    <img src="${despuesImgSrc}" alt="Después del trabajo" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px;" />
                  </div>
                </div>
              </td>
            ` : ''}
          </tr>
        </table>
      `;
    }

    let trabajosHtml = '';
    let isMultiple = false;
    let listTrabajos: { descripcion: string; materiales?: string | null; observaciones?: string | null }[] = [];

    try {
      if (evidencia.descripcion_trabajo && evidencia.descripcion_trabajo.trim().startsWith('[')) {
        listTrabajos = JSON.parse(evidencia.descripcion_trabajo);
        isMultiple = true;
      }
    } catch (e) {
      console.warn('Error parsing trabajos JSON:', e);
    }

    if (isMultiple && listTrabajos.length > 0) {
      trabajosHtml = `
        <div class="section-title">Trabajos / Arreglos Realizados</div>
        ${listTrabajos.map((t: any, idx) => `
          <div style="margin-bottom: 12px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; page-break-inside: avoid; background-color: #ffffff;">
            <div style="background-color: #f7fafc; padding: 6px 10px; font-weight: 800; font-size: 11px; color: #1a365d; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; letter-spacing: 0.5px;">
              Trabajo #${idx + 1}
            </div>
            <table style="width: 100%; border-collapse: collapse; border: none;">
              <tr>
                <td style="padding: 6px 10px; font-size: 11px; font-weight: 700; color: #4a5568; width: 25%; border-bottom: 1px solid #edf2f7; border-right: 1px solid #edf2f7; background-color: #f8fafc; vertical-align: top;">Descripción</td>
                <td style="padding: 6px 10px; font-size: 11px; color: #2d3748; border-bottom: 1px solid #edf2f7; vertical-align: top;">${t.descripcion}</td>
              </tr>
              ${t.materiales ? `
              <tr>
                <td style="padding: 6px 10px; font-size: 11px; font-weight: 700; color: #4a5568; border-bottom: 1px solid #edf2f7; border-right: 1px solid #edf2f7; background-color: #f8fafc; vertical-align: top;">Materiales</td>
                <td style="padding: 6px 10px; font-size: 11px; color: #2d3748; border-bottom: 1px solid #edf2f7; vertical-align: top;">${t.materiales}</td>
              </tr>
              ` : ''}
              ${(t.solucion || t.observaciones) ? `
              <tr>
                <td style="padding: 6px 10px; font-size: 11px; font-weight: 700; color: #4a5568; border-right: 1px solid #edf2f7; background-color: #f8fafc; vertical-align: top;">Solución</td>
                <td style="padding: 6px 10px; font-size: 11px; color: #2d3748; vertical-align: top;">${t.solucion || t.observaciones}</td>
              </tr>
              ` : ''}
            </table>
          </div>
        `).join('')}
      `;
    } else {
      trabajosHtml = `
        <table class="info-table">
          <tr>
            <td class="label">Trabajo Inicial</td>
            <td class="value" colspan="3">${evidencia.descripcion_trabajo}</td>
          </tr>
          ${evidencia.materiales_usados ? `
          <tr>
            <td class="label">Materiales Utilizados</td>
            <td class="value" colspan="3">${evidencia.materiales_usados}</td>
          </tr>
          ` : ''}
          ${evidencia.observaciones ? `
          <tr>
            <td class="label">Solución</td>
            <td class="value" colspan="3">${evidencia.observaciones}</td>
          </tr>
          ` : ''}
        </table>
      `;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Reporte de Evidencia - INTTEC</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #2b2d42;
            margin: 0;
            padding: 20px;
            line-height: 1.4;
            background-color: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            @page {
              size: letter;
              margin: 15mm;
            }
          }
          .header-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px solid #1a365d;
            padding-bottom: 12px;
            margin-bottom: 15px;
          }
          .logo-area {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .logo-text {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
          }
          .logo-brand {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 22px;
            font-weight: 900;
            font-style: italic;
            color: #1a365d;
            line-height: 1;
            letter-spacing: 0.5px;
          }
          .logo-tagline {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 7px;
            font-weight: 700;
            color: #4a5568;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            margin-top: 2px;
          }
          .logo-img {
            width: 32px;
            height: 32px;
            object-fit: contain;
          }
          .report-info {
            text-align: right;
          }
          .report-title {
            font-size: 15px;
            font-weight: 800;
            color: #1a365d;
            text-transform: uppercase;
            margin: 0;
            letter-spacing: 0.5px;
          }
          .report-meta {
            font-size: 10px;
            color: #718096;
            margin-top: 2px;
          }
          .section-title {
            font-size: 12px;
            font-weight: 800;
            color: #1a365d;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 4px;
            margin-top: 15px;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
          }
          .info-table td {
            padding: 6px 10px;
            font-size: 11px;
          }
          .info-table td.label {
            font-weight: 700;
            color: #4a5568;
            width: 25%;
            background-color: #f7fafc;
            border: 1px solid #edf2f7;
          }
          .info-table td.value {
            color: #2d3748;
            border: 1px solid #edf2f7;
          }
          .evidence-grid {
            display: flex;
            gap: 15px;
            margin-bottom: 15px;
          }
          .evidence-card {
            flex: 1;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            overflow: hidden;
            background-color: #f7fafc;
          }
          .card-header {
            font-size: 10px;
            font-weight: 800;
            text-align: center;
            padding: 4px;
            color: #ffffff;
          }
          .card-header.antes {
            background-color: #e53e3e;
          }
          .card-header.despues {
            background-color: #38a169;
          }
          .image-wrapper {
            height: 180px;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: #edf2f7;
            padding: 8px;
          }
          .image-wrapper img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            border-radius: 4px;
          }
          .report-box {
            background-color: #f8fafc;
            border-left: 4px solid #1a365d;
            border-radius: 6px;
            padding: 12px 18px;
            font-size: 11px;
            color: #1e293b;
            margin-bottom: 20px;
            box-shadow: inset 0 1px 3px rgba(0,0,0,0.02);
          }
          .report-box p {
            margin: 4px 0;
          }
          .report-box ul {
            margin: 4px 0;
            padding-left: 20px;
          }
          .report-box li {
            margin: 3px 0;
            color: #334155;
          }
          .report-box strong {
            color: #0f172a;
            display: inline-block;
            margin-top: 6px;
          }
          .footer {
            margin-top: 25px;
            text-align: center;
            font-size: 8px;
            color: #a0aec0;
            border-top: 1px solid #e2e8f0;
            padding-top: 10px;
            letter-spacing: 0.5px;
          }
        </style>
      </head>
      <body>
        <table style="width: 100%; border-collapse: collapse; border-bottom: 3px solid #1a365d; padding-bottom: 12px; margin-bottom: 15px; border: none;">
          <tr>
            <td style="vertical-align: middle; border: none; padding: 0;">
              <table style="border-collapse: collapse; border: none;">
                <tr>
                  <td style="vertical-align: middle; padding: 0; border: none;">
                    <span style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 22px; font-weight: 900; font-style: italic; color: #1a365d; line-height: 1; letter-spacing: 0.5px;">INTTEC</span><br/>
                    <span style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7px; font-weight: 700; color: #4a5568; letter-spacing: 0.8px; text-transform: uppercase; margin-top: 2px; display: inline-block;">INTEGRACIÓN DE TECNOLOGÍAS</span>
                  </td>
                  <td style="vertical-align: middle; padding-left: 10px; border: none;">
                    <img src="${LOGO_BASE64}" style="width: 32px; height: 32px; object-fit: contain;" />
                  </td>
                </tr>
              </table>
            </td>
            <td style="text-align: right; vertical-align: middle; border: none; padding: 0;">
              <h1 class="report-title" style="font-size: 15px; font-weight: 800; color: #1a365d; text-transform: uppercase; margin: 0; letter-spacing: 0.5px;">Reporte Técnico de Evidencia</h1>
              <p class="report-meta" style="font-size: 10px; color: #718096; margin-top: 2px; margin-bottom: 0;">Fecha: ${fecha}</p>
            </td>
          </tr>
        </table>

        <table class="info-table" style="margin-bottom: 10px;">
          <tr>
            <td class="label">Responsable</td>
            <td class="value">${userName}</td>
            <td class="label">Cliente / Ubicación</td>
            <td class="value">${evidencia.cliente}</td>
          </tr>
        </table>

        ${trabajosHtml}

        ${fotosHtml}

        <div class="section-title">Análisis Técnico IA (Gemini)</div>
        <div class="report-box">${parseMarkdownToHtml(evidencia.resumen_ia || 'No se generó resumen técnico de IA.')}</div>

        <div class="footer">
          Documento Generado por el Sistema de Control de Gastos y Evidencias INTTEC. CONFIDENCIAL.
        </div>
        ${fotosAdicionalesHtml}
      </body>
      </html>
    `;

    try {
      if (Platform.OS === 'web') {
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
          iframeDoc.write(htmlContent);
          iframeDoc.close();

          setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 1000);
          }, 500);
        }
        return;
      }

      // Generar archivo PDF temporal
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      
      const pdfFileName = `reporte_evidencia_${Date.now()}.pdf`;
      const safeUri = `${cacheDirectory}${pdfFileName}`;
      
      try {
        // Copiar el archivo generado por Print al cacheDirectory de la app
        // para evitar errores de permisos al compartir (sin usar Base64 para evitar OOM)
        await copyAsync({ from: uri, to: safeUri });

        // Convertir a URI content:// en Android para asegurar que otras apps puedan leer el archivo
        const shareUri = Platform.OS === 'android' ? await getContentUriAsync(safeUri) : safeUri;

        // Compartir nativamente
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(shareUri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Exportar Reporte de Evidencia PDF',
            UTI: 'com.adobe.pdf',
          });
        } else {
          throw new Error('La función de compartir no está disponible en este dispositivo.');
        }
      } catch (shareError) {
        console.warn('Error al compartir archivo directo (normal en Expo Go, se usará impresión nativa):', shareError);
        // Fallback definitivo: Abre el diálogo de impresión del sistema
        // Desde aquí el usuario puede "Guardar como PDF" o imprimir directamente,
        // lo cual funciona 100% en Expo Go ya que el sistema operativo maneja la renderización.
        await Print.printAsync({ html: htmlContent });
      }
    } catch (error: any) {
      console.error('Error generating evidence PDF report:', error);
      throw new Error(error.message || 'Error al generar el reporte de evidencia PDF.');
    }
  },
};
