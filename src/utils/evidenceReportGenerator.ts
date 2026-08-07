import { cacheDirectory, copyAsync, getContentUriAsync } from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
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

// Helper para optimizar y convertir imágenes a Base64 ligero para el PDF y asegurar que carguen 100% en Android/iOS/Web
const preparePdfImage = async (uriOrBase64: string): Promise<string> => {
  if (!uriOrBase64 || typeof uriOrBase64 !== 'string') return '';
  const clean = uriOrBase64.trim();
  if (!clean) return '';

  try {
    let inputUri = clean;
    
    // Si ya es un data URI base64
    if (clean.startsWith('data:image/')) {
      try {
        const manipulated = await ImageManipulator.manipulateAsync(
          clean,
          [{ resize: { width: 500 } }],
          { compress: 0.35, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        return manipulated.base64 ? `data:image/jpeg;base64,${manipulated.base64}` : clean;
      } catch {
        return clean;
      }
    }

    // Si es un base64 sin prefijo
    if (
      clean.includes('base64,') || 
      (!clean.startsWith('http://') && !clean.startsWith('https://') && !clean.startsWith('file:') && !clean.startsWith('content:') && !clean.startsWith('/'))
    ) {
      inputUri = clean.startsWith('data:') ? clean : `data:image/jpeg;base64,${clean}`;
    }

    // Redimensionar a 500px ancho y comprimir a JPEG liviano (~15KB)
    const manipulated = await ImageManipulator.manipulateAsync(
      inputUri,
      [{ resize: { width: 500 } }],
      { compress: 0.35, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    if (manipulated.base64) {
      return `data:image/jpeg;base64,${manipulated.base64}`;
    }
    return manipulated.uri || clean;
  } catch (err) {
    console.warn('Could not downsample image for PDF, returning fallback:', err);
    if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('file:') || clean.startsWith('content:')) {
      return clean;
    }
    return `data:image/jpeg;base64,${clean}`;
  }
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

    // Parse list of trabajos
    let listTrabajos: { 
      descripcion: string; 
      materiales?: string | null; 
      observaciones?: string | null; 
      solucion?: string | null; 
      antesImg?: string | null; 
      despuesImg?: string | null; 
      fotosAdicionales?: string[] 
    }[] = [];
    let isMultiple = false;

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
        observaciones: evidencia.observaciones,
        antesImg: evidencia.foto_antes_url,
        despuesImg: evidencia.foto_despues_url,
        fotosAdicionales: evidencia.fotos_adicionales_urls || [],
      }];
    }

    // Downscale y conversión a base64 seguro en lotes de 4
    const optimizedTrabajos = await Promise.all(
      listTrabajos.map(async (t) => {
        const antesOpt = t.antesImg ? await preparePdfImage(t.antesImg) : null;
        const despuesOpt = t.despuesImg ? await preparePdfImage(t.despuesImg) : null;
        const validExtras = (t.fotosAdicionales || []).filter(Boolean);
        const optExtras: string[] = [];
        const BATCH_SIZE = 4;
        for (let i = 0; i < validExtras.length; i += BATCH_SIZE) {
          const chunk = validExtras.slice(i, i + BATCH_SIZE);
          const processed = await Promise.all(chunk.map(f => preparePdfImage(f)));
          optExtras.push(...processed.filter(Boolean));
        }
        return {
          ...t,
          antesImg: antesOpt,
          despuesImg: despuesOpt,
          fotosAdicionales: optExtras,
        };
      })
    );

    // Optimizar fotos adicionales globales si se pasaron por separado
    const validExtras = (fotosAdicionales || []).filter(Boolean);
    const optimizedExtras: string[] = [];
    const BATCH_SIZE = 4;
    for (let i = 0; i < validExtras.length; i += BATCH_SIZE) {
      const chunk = validExtras.slice(i, i + BATCH_SIZE);
      const processed = await Promise.all(chunk.map(f => preparePdfImage(f)));
      optimizedExtras.push(...processed.filter(Boolean));
    }

    // Renderizar exactamente 2 fotos grandes por hoja (página independiente)
    const renderPhotoPages = (photos: string[], sectionTitle: string) => {
      const cleanPhotos = (photos || []).filter(Boolean);
      if (cleanPhotos.length === 0) return '';
      let pagesHtml = '';
      const PHOTOS_PER_PAGE = 2; // 2 fotos de tamaño grande por hoja
      
      for (let i = 0; i < cleanPhotos.length; i += PHOTOS_PER_PAGE) {
        const pagePhotos = cleanPhotos.slice(i, i + PHOTOS_PER_PAGE);
        const startIdx = i + 1;
        const endIdx = i + pagePhotos.length;
        const pageSubtitle = pagePhotos.length === 1 
          ? `Foto ${startIdx} de ${cleanPhotos.length}` 
          : `Fotos ${startIdx} y ${endIdx} de ${cleanPhotos.length}`;

        pagesHtml += `
          <div class="photo-page" style="page-break-before: always; page-break-inside: avoid; padding-top: 15px;">
            <div class="photo-page-header" style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1a365d; padding-bottom: 6px; margin-bottom: 18px;">
              <div style="font-size: 14px; font-weight: 800; color: #1a365d; text-transform: uppercase; letter-spacing: 0.5px;">
                ${sectionTitle}
              </div>
              <div style="font-size: 11px; font-weight: 700; color: #718096;">
                ${pageSubtitle}
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 20px;">
              ${pagePhotos.map((imgSrc, pIdx) => `
                <div class="large-photo-card" style="border: 1px solid #cbd5e0; border-radius: 8px; background-color: #ffffff; overflow: hidden; page-break-inside: avoid;">
                  <div style="font-size: 12px; font-weight: 700; color: #2d3748; background-color: #f1f5f9; padding: 8px 14px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                    <span>Fotografía #${i + pIdx + 1}</span>
                    <span style="font-size: 10px; color: #64748b; font-weight: 600;">Evidencia de Trabajo</span>
                  </div>
                  <div style="height: 380px; display: flex; align-items: center; justify-content: center; background-color: #f8fafc; padding: 10px;">
                    <img src="${imgSrc}" alt="Foto #${i + pIdx + 1}" style="max-width: 100%; max-height: 380px; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto;" />
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
      return pagesHtml;
    };

    let trabajosHtml = '';
    let perJobPhotoAnnexesHtml = '';

    if (optimizedTrabajos.length > 0) {
      trabajosHtml = optimizedTrabajos.map((t, idx) => {
        if (t.fotosAdicionales && t.fotosAdicionales.length > 0) {
          const jobTitle = optimizedTrabajos.length > 1 ? `Anexo Fotográfico - Trabajo #${idx + 1}` : 'Anexo Fotográfico de Evidencia';
          perJobPhotoAnnexesHtml += renderPhotoPages(t.fotosAdicionales, jobTitle);
        }

        return `
          <div style="margin-bottom: 25px; page-break-inside: avoid;">
            ${optimizedTrabajos.length > 1 ? `
              <div style="background-color: #edf2f7; padding: 6px 10px; border-radius: 4px; font-size: 14px; font-weight: 800; color: #2d3748; margin-bottom: 12px; border-left: 4px solid #3182ce;">
                TRABAJO #${idx + 1}
              </div>
            ` : ''}
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
            <table style="width: 100%; border-collapse: separate; border-spacing: 12px 0; margin-top: 15px; border: none;">
              <tr>
                ${t.antesImg ? `
                  <td style="width: 50%; vertical-align: top; padding: 0; border: none;">
                    <div class="evidence-card" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #f7fafc;">
                      <div class="card-header antes" style="font-size: 11px; font-weight: 800; text-align: center; padding: 6px; color: #ffffff; background-color: #e53e3e; letter-spacing: 0.5px;">ESTADO ANTES</div>
                      <div class="image-wrapper" style="height: 220px; display: flex; align-items: center; justify-content: center; background-color: #f1f5f9; padding: 8px;">
                        <img src="${t.antesImg}" alt="Antes del trabajo" style="max-width: 100%; max-height: 220px; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto;" />
                      </div>
                    </div>
                  </td>
                ` : ''}
                ${t.despuesImg ? `
                  <td style="width: 50%; vertical-align: top; padding: 0; border: none;">
                    <div class="evidence-card" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #f7fafc;">
                      <div class="card-header despues" style="font-size: 11px; font-weight: 800; text-align: center; padding: 6px; color: #ffffff; background-color: #38a169; letter-spacing: 0.5px;">ESTADO DESPUÉS</div>
                      <div class="image-wrapper" style="height: 220px; display: flex; align-items: center; justify-content: center; background-color: #f1f5f9; padding: 8px;">
                        <img src="${t.despuesImg}" alt="Después del trabajo" style="max-width: 100%; max-height: 220px; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto;" />
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
    }

    const globalExtrasHtml = renderPhotoPages(optimizedExtras, 'Anexo Fotográfico General');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Hoja de servicio - ${evidencia.cliente || 'General'}</title>
        <style>
          * {
            box-sizing: border-box;
          }
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
              margin: 12mm 10mm;
            }
            .photo-page {
              page-break-before: always !important;
              page-break-inside: avoid !important;
            }
            .large-photo-card {
              page-break-inside: avoid !important;
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
          .evidence-card {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            overflow: hidden;
            background-color: #f7fafc;
          }
          .card-header {
            font-size: 11px;
            font-weight: 800;
            text-align: center;
            padding: 6px;
            color: #ffffff;
          }
          .card-header.antes {
            background-color: #e53e3e;
          }
          .card-header.despues {
            background-color: #38a169;
          }
          .image-wrapper {
            height: 220px;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: #f1f5f9;
            padding: 8px;
          }
          .image-wrapper img {
            max-width: 100%;
            max-height: 220px;
            object-fit: contain;
            border-radius: 4px;
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

        <table class="info-table" style="margin-bottom: 15px;">
          <tr>
            <td class="label">Responsable</td>
            <td class="value">${userName}</td>
            <td class="label">Cliente / Ubicación</td>
            <td class="value">${evidencia.cliente}</td>
          </tr>
        </table>

        ${trabajosHtml}
        
        <div style="margin-top: 25px; border-top: 1px solid #e2e8f0; padding-top: 8px; text-align: center; font-size: 9px; color: #718096; page-break-inside: avoid;">
          Documento Generado por el Sistema de Control de Gastos y Evidencias. CONFIDENCIAL.
        </div>

        ${perJobPhotoAnnexesHtml}
        ${globalExtrasHtml}
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

      // Intentar generación de archivo PDF y compartir nativamente
      try {
        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        const safeUri = `${cacheDirectory}${cacheDirectory?.endsWith('/') ? '' : '/'}${pdfFileName}`;
        await copyAsync({ from: uri, to: safeUri });

        const shareUri = Platform.OS === 'android' ? await getContentUriAsync(safeUri) : safeUri;

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(shareUri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Exportar Reporte de Evidencia PDF',
            UTI: 'com.adobe.pdf',
          });
          return;
        }
      } catch (fileErr) {
        console.warn('printToFileAsync/Sharing error, attempting native print fallback:', fileErr);
      }

      // Fallback 100% confiable: Abre el diálogo de impresión/guardar como PDF del sistema
      await Print.printAsync({ html: htmlContent });
    } catch (error: any) {
      console.error('Error generating evidence PDF report:', error);
      throw new Error(error.message || 'Error al generar el reporte de evidencia PDF.');
    }
  },
};
