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
    userName: string,
    fotosAdicionales: string[] = []
  ): Promise<void> {
    const fecha = evidencia.created_at
      ? new Date(evidencia.created_at).toLocaleString('es-MX')
      : new Date().toLocaleString('es-MX');



    const textToBulletPoints = (text: string): string => {
      if (!text) return '';
      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      const bulletLines = lines.map(line => {
        let trimmed = line.trim();
        if (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('•') || trimmed.startsWith('৹')) {
          trimmed = trimmed.substring(1).trim();
        }
        return `<li style="margin-bottom: 6px; list-style-type: none; position: relative;"><span style="position: absolute; left: -14px;">৹</span>${trimmed}</li>`;
      });
      return `<ul style="margin: 4px 0; padding-left: 18px; list-style-type: none;">\n${bulletLines.join('\n')}\n</ul>`;
    };


    let fotosAdicionalesHtml = '';
    if (fotosAdicionales && fotosAdicionales.length > 0) {
      fotosAdicionales.forEach((foto, index) => {
        if (!foto) return;
        const imgSrc = foto.startsWith('data:') || foto.startsWith('http') 
          ? foto 
          : `data:image/jpeg;base64,${foto}`;
        
        fotosAdicionalesHtml += `
          <div style="page-break-before: always; display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-inside: avoid; text-align: center; box-sizing: border-box; padding: 20px 0;">
            <div style="font-size: 12px; font-weight: bold; color: #1a365d; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.5px;">Foto Adicional #${index + 1}</div>
            <div style="display: flex; align-items: center; justify-content: center; width: 100%; max-height: 800px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; box-sizing: border-box;">
              <img src="${imgSrc}" style="max-width: 100%; max-height: 800px; object-fit: contain; border-radius: 4px;" />
            </div>
            <div style="margin-top: 15px; font-size: 8px; color: #a0aec0; letter-spacing: 0.5px;">
              Reporte de Evidencias - Anexo Fotográfico Adicional
            </div>
          </div>
        `;
      });
    }

    let trabajosHtml = '';
    let isMultiple = false;
    let listTrabajos: { descripcion: string; materiales?: string | null; observaciones?: string | null; solucion?: string | null; antesImg?: string | null; despuesImg?: string | null; fotosAdicionales?: string[] }[] = [];

    try {
      if (evidencia.descripcion_trabajo && evidencia.descripcion_trabajo.trim().startsWith('[')) {
        listTrabajos = JSON.parse(evidencia.descripcion_trabajo);
        isMultiple = true;
      }
    } catch (e) {
      console.warn('Error parsing trabajos JSON:', e);
    }

    if (!isMultiple) {
      listTrabajos = [{
        descripcion: evidencia.descripcion_trabajo || '',
        materiales: evidencia.materiales_usados,
        observaciones: evidencia.observaciones
      }];
    }

    if (listTrabajos.length > 0) {
      trabajosHtml = listTrabajos.map((t) => {
        return `
          <div style="margin-bottom: 25px; page-break-inside: avoid;">
            <h2 style="font-size: 18px; font-weight: bold; color: #000; margin-bottom: 8px; margin-top: 0;">Situación encontrada</h2>
            <div style="font-size: 16px; color: #000; margin-bottom: 12px; line-height: 1.5; padding-left: 2px;">
              ${parseMarkdownToHtml(t.descripcion || '')}
            </div>
            
            ${(t.solucion || t.observaciones) ? `
            <h3 style="font-size: 16px; font-weight: bold; color: #000; margin-bottom: 4px; margin-top: 0;">Solución:</h3>
            <div style="font-size: 16px; color: #000; margin-bottom: 12px; line-height: 1.5;">
              ${textToBulletPoints(t.solucion || t.observaciones || '')}
            </div>
            ` : ''}

            ${t.materiales ? `
            <h3 style="font-size: 16px; font-weight: bold; color: #000; margin-bottom: 4px; margin-top: 0;">Material:</h3>
            <div style="font-size: 16px; color: #000; margin-bottom: 12px; line-height: 1.5;">
              ${textToBulletPoints(t.materiales)}
            </div>
            ` : ''}

            ${(t.antesImg || t.despuesImg) ? `
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px; border: none;">
              <tr>
                ${t.antesImg ? `
                  <td style="width: 50%; padding: 0 10px 0 0; vertical-align: top; border: none;">
                    <div class="evidence-card" style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background-color: #f7fafc;">
                      <div class="card-header antes" style="font-size: 10px; font-weight: 800; text-align: center; padding: 4px; color: #ffffff; background-color: #e53e3e;">ESTADO ANTES</div>
                      <div class="image-wrapper" style="height: 180px; display: flex; align-items: center; justify-content: center; background-color: #edf2f7; padding: 8px;">
                        <img src="${t.antesImg.startsWith('data:') || t.antesImg.startsWith('http') ? t.antesImg : `data:image/jpeg;base64,${t.antesImg}`}" alt="Antes del trabajo" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px;" />
                      </div>
                    </div>
                  </td>
                ` : ''}
                ${t.despuesImg ? `
                  <td style="width: 50%; padding: 0 0 0 10px; vertical-align: top; border: none;">
                    <div class="evidence-card" style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background-color: #f7fafc;">
                      <div class="card-header despues" style="font-size: 10px; font-weight: 800; text-align: center; padding: 4px; color: #ffffff; background-color: #38a169;">ESTADO DESPUÉS</div>
                      <div class="image-wrapper" style="height: 180px; display: flex; align-items: center; justify-content: center; background-color: #edf2f7; padding: 8px;">
                        <img src="${t.despuesImg.startsWith('data:') || t.despuesImg.startsWith('http') ? t.despuesImg : `data:image/jpeg;base64,${t.despuesImg}`}" alt="Después del trabajo" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px;" />
                      </div>
                    </div>
                  </td>
                ` : ''}
              </tr>
            </table>
            ` : ''}
          </div>
        `;
      }).join('');
      
      // Append per-job additional photos
      listTrabajos.forEach((t, i) => {
        if (t.fotosAdicionales && t.fotosAdicionales.length > 0) {
          t.fotosAdicionales.forEach((foto, index) => {
            if (!foto) return;
            const imgSrc = foto.startsWith('data:') || foto.startsWith('http') 
              ? foto 
              : `data:image/jpeg;base64,${foto}`;
            
            fotosAdicionalesHtml += `
              <div style="page-break-before: always; display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-inside: avoid; text-align: center; box-sizing: border-box; padding: 20px 0;">
                <div style="font-size: 12px; font-weight: bold; color: #1a365d; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.5px;">Trabajo #${i + 1} - Foto Adicional #${index + 1}</div>
                <div style="display: flex; align-items: center; justify-content: center; width: 100%; max-height: 800px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; box-sizing: border-box;">
                  <img src="${imgSrc}" style="max-width: 100%; max-height: 800px; object-fit: contain; border-radius: 4px;" />
                </div>
                <div style="margin-top: 15px; font-size: 8px; color: #a0aec0; letter-spacing: 0.5px;">
                  Reporte de Evidencias - Anexo Fotográfico Adicional
                </div>
              </div>
            `;
          });
        }
      });
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Hoja de servicio - ${evidencia.cliente || 'General'}</title>
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
              padding: 0 !important;
              margin: 0 !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            @page {
              size: letter;
              margin: 12mm;
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
            font-size: 38px;
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
            width: 300px;
            height: 100px;
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
            page-break-inside: avoid;
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
                    <img src="${LOGO_BASE64}" style="max-height: 60px; max-width: 250px; object-fit: contain;" />
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
        
        <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; text-align: center; font-size: 9px; color: #718096; page-break-inside: avoid;">
          Documento Generado por el Sistema de Control de Gastos y Evidencias. CONFIDENCIAL.
        </div>
        ${fotosAdicionalesHtml}
      </body>
      </html>
    `;

    try {
      const safeClientName = (evidencia.cliente || 'general').replace(/[^a-zA-Z0-9 -_]/g, '').trim().replace(/ /g, '_');
      const pdfFileName = `Hoja_de_servicio_${safeClientName}.pdf`;
      const baseName = `Hoja de servicio - ${evidencia.cliente || 'General'}`;

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
            const originalTitle = document.title;
            document.title = baseName;
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            
            // Revert title after a short delay to allow print dialog to capture it
            setTimeout(() => {
              document.title = originalTitle;
            }, 1000);

            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 1000);
          }, 500);
        }
        return;
      }

      // Generar archivo PDF temporal
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      
      const safeUri = `${cacheDirectory}${cacheDirectory?.endsWith('/') ? '' : '/'}${pdfFileName}`;
      
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
