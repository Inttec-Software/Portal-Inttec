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
      (!clean.startsWith('http://') && !clean.startsWith('https://') && !clean.startsWith('file:') && !clean.startsWith('content:') && !clean.startsWith('/') && !clean.startsWith('blob:'))
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
    if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('file:') || clean.startsWith('content:') || clean.startsWith('blob:')) {
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
    const dateObj = evidencia.created_at ? new Date(evidencia.created_at) : new Date();
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const fecha = `${dateObj.getDate()} de ${meses[dateObj.getMonth()]} del ${dateObj.getFullYear()}`;



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

    // Se eliminó la optimización de fotos adicionales globales porque ya no se renderizan

    // Se eliminó renderPhotoPages porque las fotos ahora se renderizan inline en cada trabajo

    let trabajosHtml = '';

    if (optimizedTrabajos.length > 0) {
      trabajosHtml = optimizedTrabajos.map((t, idx) => {
        // Unificar todas las fotos en un solo arreglo limpio
        const todasLasFotos = [t.antesImg, t.despuesImg, ...(t.fotosAdicionales || [])].filter(Boolean) as string[];
        
        let fotosHtml = '';
        if (todasLasFotos.length > 0) {
          if (todasLasFotos.length === 1) {
            fotosHtml = `
              <div style="margin-top: 15px; text-align: center; page-break-inside: avoid;">
                <img src="${todasLasFotos[0]}" style="max-width: 100%; max-height: 400px; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto;" />
              </div>
            `;
          } else {
            // Usar inline-block para compatibilidad universal de 2 columnas
            fotosHtml = `
              <div style="margin-top: 15px; text-align: center;">
                ${todasLasFotos.map(img => `
                  <div style="display: inline-block; width: 48%; margin: 0 0.5% 15px 0.5%; vertical-align: top; page-break-inside: avoid;">
                    <img src="${img}" style="width: 100%; height: 350px; object-fit: contain; border-radius: 4px; display: block;" />
                  </div>
                `).join('')}
              </div>
            `;
          }
        }

        return `
          <div style="margin-bottom: 30px; page-break-inside: auto;">
            <h2 style="font-size: 18px; font-weight: bold; margin-bottom: 10px; color: #000;">
              Situación encontrada
            </h2>
            <div style="font-size: 16px; margin-bottom: 12px; color: #000; line-height: 1.5;">
                ${parseMarkdownToHtml(t.descripcion || '')}
              </div>
              
              ${(t.solucion || t.observaciones) ? `
              <h3 style="font-size: 18px; font-weight: bold; color: #000; margin-bottom: 4px; margin-top: 0;">Solución:</h3>
              <div style="font-size: 16px; color: #000; margin-bottom: 12px; line-height: 1.5;">
                ${textToBulletPoints(t.solucion || t.observaciones || '')}
              </div>
              ` : ''}

              ${t.materiales ? `
              <h3 style="font-size: 18px; font-weight: bold; color: #000; margin-bottom: 4px; margin-top: 0;">Material:</h3>
              <div style="font-size: 16px; color: #000; margin-bottom: 12px; line-height: 1.5;">
                ${textToBulletPoints(t.materiales)}
              </div>
              ` : ''}
            </div>
            
            ${fotosHtml}
          </div>
        `;
      }).join('');
    }

    // Título principal con el nombre de la sucursal o el cliente
    const tituloPrincipal = `Reporte de mantenimiento ${(evidencia as any).sucursal_nombre ? 'sucursal ' + (evidencia as any).sucursal_nombre : (evidencia.cliente || '')}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Reporte de mantenimiento - ${evidencia.cliente || 'General'}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: 'Calibri', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #000000;
            margin: 0;
            padding: 15mm 15mm 25mm 15mm;
            line-height: 1.4;
            background-color: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page {
            size: letter;
            margin: 0;
          }
          table.report-container {
            width: 100%;
          }
          thead.report-header {
            display: table-header-group;
          }
          tfoot.report-footer {
            display: table-footer-group;
          }
          .header-inner {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 15px;
            margin-bottom: 15px;
            border-bottom: 2px solid #000;
          }
          .header-logo {
            max-height: 50px;
            max-width: 150px;
            object-fit: contain;
          }
          .header-title {
            font-size: 20px;
            font-weight: bold;
            color: #000;
            margin: 0;
            text-transform: uppercase;
            text-align: center;
            flex: 1;
          }
          .header-date {
            font-size: 14px;
            font-weight: normal;
            color: #333;
            text-align: right;
            min-width: 150px;
          }
          .footer-inner {
            display: flex;
            justify-content: space-between;
            padding-top: 10px;
            margin-top: 20px;
            font-size: 12px;
            color: #666;
          }
          .page-number:after {
            content: counter(page);
          }
          ul {
            margin: 0;
            padding-left: 20px;
          }
          li {
            margin-bottom: 6px;
          }
        </style>
      </head>
      <body>
        <table class="report-container">
          <thead class="report-header">
            <tr>
              <td>
                <div class="header-inner">
                  <img src="${LOGO_BASE64}" class="header-logo" />
                  <h1 class="header-title">REPORTE DE SERVICIOS REALIZADOS</h1>
                  <div class="header-date">${fecha}</div>
                </div>
              </td>
            </tr>
          </thead>
          
          <tfoot class="report-footer">
            <tr>
              <td>
                <div class="footer-inner">
                  <span></span>
                  <span>Integración de Tecnologías</span>
                  <span class="page-number"></span>
                </div>
              </td>
            </tr>
          </tfoot>

          <tbody>
            <tr>
              <td>
                <table style="width: 100%; margin: 10px 0 25px 0; border-collapse: collapse; font-size: 12px; border: 1px solid #ddd; text-align: center;">
                  <thead>
                    <tr>
                      <th style="padding: 4px 10px; border: 1px solid #ddd; background-color: #eee; font-weight: bold; color: #333; width: 50%;">CLIENTE</th>
                      <th style="padding: 4px 10px; border: 1px solid #ddd; background-color: #eee; font-weight: bold; color: #333; width: 50%;">SUCURSAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style="padding: 6px 10px; border: 1px solid #ddd; color: #000;">${(evidencia.cliente || '').split('-')[0].trim()}</td>
                      <td style="padding: 6px 10px; border: 1px solid #ddd; color: #000;">${(evidencia as any).sucursal_nombre || (evidencia.cliente || '').split('-')[1]?.trim() || 'N/A'}</td>
                    </tr>
                  </tbody>
                </table>

                ${trabajosHtml}
              </td>
            </tr>
          </tbody>
        </table>
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
