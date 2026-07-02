import { cacheDirectory, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { Gasto, Asistencia, Usuario } from '../services/supabase';
import { LOGO_BASE64 } from './logoBase64';

export interface ReportProducto {
  id: string;
  sku_interno: string;
  nombre_oficial: string;
  categoria_id: string;
  stock_actual: number;
  activo: boolean;
}

export interface ReportCategoria {
  id: string;
  nombre: string;
}

/**
 * Detecta si un gasto tiene alguna alerta de política (como alcohol, tabaco o montos sospechosos)
 */
const hasPolicyAlert = (g: Gasto): { alert: boolean; reason: string } => {
  const just = g.justificacion || '';
  
  // 1. Detectar si el formulario guardó una alerta estructurada de la IA
  const match = just.match(/^\[ALERTA IA:\s*([\s\S]*?)\]/);
  if (match) {
    return { alert: true, reason: match[1].trim() };
  }
  
  // 2. Búsqueda complementaria de palabras clave en la justificación, categoría, subcategoría o proveedor
  const textToSearch = `${just} ${g.categoria || ''} ${g.subcategoria || ''} ${g.proveedor || ''}`.toLowerCase();
  
  if (textToSearch.includes('alcohol') || textToSearch.includes('cerveza') || textToSearch.includes('vino') || textToSearch.includes('licor') || textToSearch.includes('bebida alcohólica')) {
    return { alert: true, reason: 'Posible compra de alcohol' };
  }
  if (textToSearch.includes('cigarro') || textToSearch.includes('cigarrillo') || textToSearch.includes('tabaco') || textToSearch.includes('cajetilla')) {
    return { alert: true, reason: 'Posible compra de tabaco' };
  }
  if (textToSearch.includes('excesivo') || textToSearch.includes('exceso') || textToSearch.includes('inflado')) {
    return { alert: true, reason: 'Monto sospechoso o propina excesiva' };
  }
  
  return { alert: false, reason: '' };
};

export const ReportGenerator = {
  /**
   * Genera un reporte PDF de los gastos y lo comparte mediante la hoja nativa
   */
  async exportToPDF(gastos: Gasto[], title: string = 'Reporte de Control de Gastos'): Promise<void> {
    if (gastos.length === 0) {
      throw new Error('No hay gastos para exportar.');
    }

    const totalMonto = gastos.reduce((sum, g) => sum + Number(g.monto), 0);
    const approvedCount = gastos.filter((g) => g.status === 'APPROVED').length;
    const pendingCount = gastos.filter((g) => g.status === 'PENDING').length;

    // Generar tabla HTML
    let tableRows = '';
    gastos.forEach((g) => {
      const fecha = g.fecha_comprobante || g.created_at?.split('T')[0] || '';
      const montoFormatted = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
      }).format(Number(g.monto));

      let badgeColor = '#FFC107'; // PENDING -> Yellow
      if (g.status === 'APPROVED') badgeColor = '#4CAF50';
      if (g.status === 'REJECTED') badgeColor = '#F44336';
      if (g.status === 'ACTION_REQUIRED') badgeColor = '#2196F3';

      const { alert, reason } = hasPolicyAlert(g);
      let rowStyle = '';
      let alertLabel = '';
      if (alert) {
        // Fondo rojo suave y texto rojo oscuro para resaltar alertas
        rowStyle = `style="background-color: #ffebee; color: #b71c1c;"`;
        alertLabel = `<div style="color: #b71c1c; font-size: 8px; font-weight: bold; margin-top: 4px;">⚠️ ALERTA: ${reason}</div>`;
      }

      tableRows += `
        <tr ${rowStyle}>
          <td>${fecha}</td>
          <td>${g.empleado_nombre || 'Desconocido'}</td>
          <td>${g.proveedor || 'N/A'}</td>
          <td>
            ${g.categoria || 'N/A'} - ${g.subcategoria || ''}
            ${alertLabel}
          </td>
          <td>${g.metodo_pago}${g.tipo_tarjeta ? ` (${g.tipo_tarjeta})` : ''}</td>
          <td><span class="status-badge" style="background-color: ${badgeColor};">${g.status}</span></td>
          <td style="text-align: right; font-weight: bold;">${montoFormatted}</td>
        </tr>
      `;
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 24px;
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
            border-bottom: 3px solid #0d1b2a;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .logo-container {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .logo-text {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
          }
          .logo-brand {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-weight: 900;
            font-style: italic;
            font-size: 22px;
            color: #0d1b2a;
            line-height: 1;
            letter-spacing: 0.5px;
          }
          .logo-tagline {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-weight: 700;
            font-size: 7px;
            color: #777;
            letter-spacing: 0.8px;
            margin-top: 2px;
            text-transform: uppercase;
          }
          .logo-img {
            width: 32px;
            height: 32px;
            object-fit: contain;
          }
          .title {
            color: #0d1b2a;
            font-size: 24px;
            font-weight: bold;
            margin: 0;
          }
          .subtitle {
            color: #777;
            font-size: 12px;
            margin-top: 5px;
          }
          .summary-grid {
            display: flex;
            justify-content: space-between;
            margin-bottom: 25px;
            gap: 15px;
          }
          .summary-card {
            flex: 1;
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 12px;
            text-align: center;
          }
          .summary-card .value {
            font-size: 18px;
            font-weight: bold;
            color: #0d1b2a;
            margin-top: 5px;
          }
          .summary-card .label {
            font-size: 10px;
            text-transform: uppercase;
            color: #888;
            letter-spacing: 0.5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 11px;
          }
          th {
            background-color: #0d1b2a;
            color: white;
            text-align: left;
            padding: 10px 8px;
            font-weight: 600;
          }
          td {
            padding: 10px 8px;
            border-bottom: 1px solid #e9ecef;
          }
          tr:nth-child(even) {
            background-color: #fcfcfd;
          }
          .status-badge {
            color: white;
            padding: 3px 6px;
            border-radius: 4px;
            font-size: 8px;
            font-weight: bold;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 10px;
            color: #aaa;
            border-top: 1px solid #eee;
            padding-top: 15px;
          }
        </style>
      </head>
      <body>
        <table style="width: 100%; border-collapse: collapse; border-bottom: 3px solid #0d1b2a; padding-bottom: 15px; margin-bottom: 20px; border: none;">
          <tr>
            <td style="vertical-align: middle; border: none; padding: 0;">
              <h1 class="title" style="margin: 0; font-size: 24px; font-weight: bold; color: #0d1b2a;">${title}</h1>
              <p class="subtitle" style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Generado el: ${new Date().toLocaleString()}</p>
            </td>
            <td style="text-align: right; vertical-align: middle; border: none; padding: 0;">
              <table style="display: inline-table; border-collapse: collapse; border: none;">
                <tr>
                  <td style="text-align: right; vertical-align: middle; padding-right: 10px; border: none;">
                    <span class="logo-brand">INTTEC</span><br/>
                    <span class="logo-tagline">INTEGRACIÓN DE TECNOLOGÍAS</span>
                  </td>
                  <td style="vertical-align: middle; border: none; padding: 0;">
                    <img class="logo-img" src="${LOGO_BASE64}" style="width: 32px; height: 32px; object-fit: contain;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; border: none;">
          <tr>
            <td style="width: 25%; padding-right: 10px; border: none;">
              <div class="summary-card">
                <div class="label">Total Gastos</div>
                <div class="value">${gastos.length}</div>
              </div>
            </td>
            <td style="width: 25%; padding-left: 5px; padding-right: 5px; border: none;">
              <div class="summary-card">
                <div class="label">Aprobados</div>
                <div class="value" style="color: #4CAF50;">${approvedCount}</div>
              </div>
            </td>
            <td style="width: 25%; padding-left: 5px; padding-right: 5px; border: none;">
              <div class="summary-card">
                <div class="label">Pendientes</div>
                <div class="value" style="color: #FFC107;">${pendingCount}</div>
              </div>
            </td>
            <td style="width: 25%; padding-left: 10px; border: none;">
              <div class="summary-card">
                <div class="label">Monto Total</div>
                <div class="value" style="color: #1b4965;">${new Intl.NumberFormat('es-MX', {
                  style: 'currency',
                  currency: 'MXN',
                }).format(totalMonto)}</div>
              </div>
            </td>
          </tr>
        </table>

        <table>
          <thead>
            <tr>
              <th style="width: 12%">Fecha</th>
              <th style="width: 20%">Empleado</th>
              <th style="width: 18%">Proveedor</th>
              <th style="width: 20%">Categoría</th>
              <th style="width: 12%">Pago</th>
              <th style="width: 8%">Estado</th>
              <th style="width: 10%; text-align: right;">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Documento Confidencial - Control de Gastos INTTEC - Sistema Automatizado
        </div>
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

      // Generar archivo PDF temporal y obtener su base64 para evitar bloqueos del sistema de archivos en Android
      const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
      
      // Para evitar el error "Not allowed to read file under given URL" y "isn't readable" en Android,
      // guardamos el PDF a partir de su contenido Base64 directamente en cacheDirectory.
      const pdfFileName = `reporte_gastos_${Date.now()}.pdf`;
      const safeUri = `${cacheDirectory}${pdfFileName}`;
      
      await writeAsStringAsync(safeUri, base64 || '', {
        encoding: EncodingType.Base64,
      });

      // Compartir nativamente
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(safeUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar Reporte PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        throw new Error('La función de compartir no está disponible en este dispositivo.');
      }
    } catch (error: any) {
      console.error('Error generating PDF report:', error);
      throw new Error(error.message || 'Error al generar el reporte PDF.');
    }
  },

  /**
   * Genera un archivo CSV de los gastos y lo comparte mediante la hoja nativa
   */
  async exportToCSV(gastos: Gasto[], fileName: string = 'reporte_gastos.csv'): Promise<void> {
    if (gastos.length === 0) {
      throw new Error('No hay gastos para exportar.');
    }

    // Encabezados
    let csvContent = '\uFEFF'; // BOM para que Excel abra UTF-8 correctamente
    csvContent += 'ID,Fecha,Empleado Nombre,Monto,Categoria,Subcategoria,Proveedor,Cliente,Servicio/Proyecto,Detalle,Sucursal,Metodo Pago,Tipo Tarjeta,Status,Alerta Politica\n';

    // Rellenar filas
    gastos.forEach((g) => {
      const fecha = g.fecha_comprobante || g.created_at?.split('T')[0] || '';
      const escape = (text?: string | null) => {
        if (!text) return '';
        const cleaned = text.replace(/"/g, '""');
        return `"${cleaned}"`;
      };

      const { alert, reason } = hasPolicyAlert(g);

      const row = [
        g.id,
        fecha,
        escape(g.empleado_nombre),
        g.monto,
        escape(g.categoria),
        escape(g.subcategoria),
        escape(g.proveedor),
        escape(g.cliente),
        escape(g.tipo_servicio_proyecto),
        escape(g.detalle_servicio_proyecto),
        escape(g.sucursal),
        g.metodo_pago,
        escape(g.tipo_tarjeta),
        g.status,
        alert ? escape(`ALERTA: ${reason}`) : '',
      ].join(',');

      csvContent += row + '\n';
    });

    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // Guardar el archivo en el sistema de archivos local de Expo (en cacheDirectory para compartir de forma segura)
      const fileUri = `${cacheDirectory}${fileName}`;
      await writeAsStringAsync(fileUri, csvContent, {
        encoding: EncodingType.UTF8,
      });

      // Compartir nativamente
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exportar Reporte CSV',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        throw new Error('La función de compartir no está disponible en este dispositivo.');
      }
    } catch (error: any) {
      console.error('Error generating CSV report:', error);
      throw new Error(error.message || 'Error al generar el reporte CSV.');
    }
  },

  /**
   * Genera un reporte PDF de asistencia y lo comparte
   */
  async exportAsistenciasToPDF(
    asistencias: Asistencia[],
    personal: Usuario[],
    title: string = 'Reporte de Asistencia INTTEC'
  ): Promise<void> {
    if (asistencias.length === 0) {
      throw new Error('No hay registros de asistencia para exportar.');
    }

    const empleadosMap = new Map(personal.map((p) => [p.id, p.nombre]));

    let tableRows = '';
    asistencias.forEach((a) => {
      const empleadoNombre = empleadosMap.get(a.empleado_id) || 'Desconocido';
      const fecha = a.fecha || '';
      const horaEntrada = a.hora_entrada || '--:--';
      const dirEntrada = a.direccion_entrada || 'N/A';
      const horaSalida = a.hora_salida || '--:--';
      const dirSalida = a.direccion_salida || 'N/A';

      tableRows += `
        <tr>
          <td>${fecha}</td>
          <td>${empleadoNombre}</td>
          <td style="color: #4CAF50; font-weight: bold;">${horaEntrada}</td>
          <td style="font-size: 9px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${dirEntrada}">${dirEntrada}</td>
          <td style="color: #F44336; font-weight: bold;">${horaSalida}</td>
          <td style="font-size: 9px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${dirSalida}">${dirSalida}</td>
        </tr>
      `;
    });

    const totalEntradas = asistencias.filter((a) => a.hora_entrada).length;
    const totalSalidas = asistencias.filter((a) => a.hora_salida).length;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 24px;
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
          .title {
            color: #0d1b2a;
            font-size: 24px;
            font-weight: bold;
            margin: 0;
          }
          .subtitle {
            color: #777;
            font-size: 12px;
            margin-top: 5px;
          }
          .summary-grid {
            display: flex;
            justify-content: space-between;
            margin-bottom: 25px;
            gap: 15px;
          }
          .summary-card {
            flex: 1;
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 12px;
            text-align: center;
          }
          .summary-card .value {
            font-size: 18px;
            font-weight: bold;
            color: #0d1b2a;
            margin-top: 5px;
          }
          .summary-card .label {
            font-size: 10px;
            text-transform: uppercase;
            color: #888;
            letter-spacing: 0.5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 10px;
          }
          th {
            background-color: #0d1b2a;
            color: white;
            text-align: left;
            padding: 8px 6px;
            font-weight: 600;
          }
          td {
            padding: 8px 6px;
            border-bottom: 1px solid #e9ecef;
          }
          tr:nth-child(even) {
            background-color: #fcfcfd;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 10px;
            color: #aaa;
            border-top: 1px solid #eee;
            padding-top: 15px;
          }
          .logo-brand {
            font-weight: 900;
            font-style: italic;
            font-size: 22px;
            color: #0d1b2a;
            line-height: 1;
            letter-spacing: 0.5px;
          }
          .logo-tagline {
            font-weight: 700;
            font-size: 7px;
            color: #777;
            letter-spacing: 0.8px;
            margin-top: 2px;
            text-transform: uppercase;
          }
          .logo-img {
            width: 32px;
            height: 32px;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <table style="width: 100%; border-collapse: collapse; border-bottom: 3px solid #0d1b2a; padding-bottom: 15px; margin-bottom: 20px; border: none;">
          <tr>
            <td style="vertical-align: middle; border: none; padding: 0;">
              <h1 class="title" style="margin: 0; font-size: 24px; font-weight: bold; color: #0d1b2a;">${title}</h1>
              <p class="subtitle" style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Generado el: ${new Date().toLocaleString()}</p>
            </td>
            <td style="text-align: right; vertical-align: middle; border: none; padding: 0;">
              <table style="display: inline-table; border-collapse: collapse; border: none;">
                <tr>
                  <td style="text-align: right; vertical-align: middle; padding-right: 10px; border: none;">
                    <span class="logo-brand">INTTEC</span><br/>
                    <span class="logo-tagline">INTEGRACIÓN DE TECNOLOGÍAS</span>
                  </td>
                  <td style="vertical-align: middle; border: none; padding: 0;">
                    <img class="logo-img" src="${LOGO_BASE64}" style="width: 32px; height: 32px; object-fit: contain;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; border: none;">
          <tr>
            <td style="width: 33%; padding-right: 10px; border: none;">
              <div class="summary-card">
                <div class="label">Total Registros</div>
                <div class="value">${asistencias.length}</div>
              </div>
            </td>
            <td style="width: 33%; padding-left: 5px; padding-right: 5px; border: none;">
              <div class="summary-card">
                <div class="label">Entradas Checadas</div>
                <div class="value" style="color: #4CAF50;">${totalEntradas}</div>
              </div>
            </td>
            <td style="width: 33%; padding-left: 10px; border: none;">
              <div class="summary-card">
                <div class="label">Salidas Checadas</div>
                <div class="value" style="color: #F44336;">${totalSalidas}</div>
              </div>
            </td>
          </tr>
        </table>

        <table>
          <thead>
            <tr>
              <th style="width: 12%">Fecha</th>
              <th style="width: 18%">Empleado</th>
              <th style="width: 10%">Entrada</th>
              <th style="width: 30%">Ubicación Entrada</th>
              <th style="width: 10%">Salida</th>
              <th style="width: 30%">Ubicación Salida</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Documento Confidencial - Control de Asistencias INTTEC - Sistema Automatizado
        </div>
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

      const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
      const pdfFileName = `reporte_asistencia_${Date.now()}.pdf`;
      const safeUri = `${cacheDirectory}${pdfFileName}`;
      
      await writeAsStringAsync(safeUri, base64 || '', {
        encoding: EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(safeUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar Reporte Asistencia PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        throw new Error('La función de compartir no está disponible.');
      }
    } catch (error: any) {
      console.error('Error generating attendance PDF:', error);
      throw new Error(error.message || 'Error al generar el reporte de asistencia.');
    }
  },

  /**
   * Genera un archivo CSV de asistencia y lo comparte
   */
  async exportAsistenciasToCSV(
    asistencias: Asistencia[],
    personal: Usuario[],
    fileName: string = 'reporte_asistencia.csv'
  ): Promise<void> {
    if (asistencias.length === 0) {
      throw new Error('No hay registros de asistencia para exportar.');
    }

    const empleadosMap = new Map(personal.map((p) => [p.id, p.nombre]));

    let csvContent = '\uFEFF'; // BOM
    csvContent += 'ID Registro,Fecha,Empleado,Hora Entrada,Ubicación Entrada,Hora Salida,Ubicación Salida\n';

    asistencias.forEach((a) => {
      const empleadoNombre = empleadosMap.get(a.empleado_id) || 'Desconocido';
      const escape = (text?: string | null) => {
        if (!text) return '';
        const cleaned = text.replace(/"/g, '""');
        return `"${cleaned}"`;
      };

      const row = [
        a.id,
        a.fecha || '',
        escape(empleadoNombre),
        a.hora_entrada || '',
        escape(a.direccion_entrada),
        a.hora_salida || '',
        escape(a.direccion_salida),
      ].join(',');

      csvContent += row + '\n';
    });

    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const fileUri = `${cacheDirectory}${fileName}`;
      await writeAsStringAsync(fileUri, csvContent, {
        encoding: EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exportar Reporte Asistencia CSV',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        throw new Error('La función de compartir no está disponible.');
      }
    } catch (error: any) {
      console.error('Error generating attendance CSV:', error);
      throw new Error(error.message || 'Error al generar reporte CSV.');
    }
  },

  /**
   * Genera un reporte PDF de inventario y lo comparte
   */
  async exportInventarioToPDF(
    productos: ReportProducto[],
    categorias: ReportCategoria[],
    title: string = 'Reporte de Inventario INTTEC'
  ): Promise<void> {
    if (productos.length === 0) {
      throw new Error('No hay productos en el inventario para exportar.');
    }

    const categoriasMap = new Map(categorias.map((c) => [c.id, c.nombre]));

    let tableRows = '';
    productos.forEach((p) => {
      const categoriaNombre = categoriasMap.get(p.categoria_id) || 'N/A';
      const statusLabel = p.activo ? 'Activo' : 'Inactivo';
      const statusColor = p.activo ? '#4CAF50' : '#F44336';
      const stockColor = p.stock_actual === 0 ? '#F44336' : p.stock_actual <= 5 ? '#FFC107' : '#333';

      tableRows += `
        <tr>
          <td>${p.sku_interno || 'N/A'}</td>
          <td style="font-weight: bold;">${p.nombre_oficial || 'N/A'}</td>
          <td>${categoriaNombre}</td>
          <td style="text-align: right; font-weight: bold; color: ${stockColor};">${p.stock_actual} pzas</td>
          <td><span style="color: ${statusColor}; font-weight: bold;">${statusLabel}</span></td>
        </tr>
      `;
    });

    const totalStock = productos.reduce((sum, p) => sum + Number(p.stock_actual), 0);
    const activeProducts = productos.filter((p) => p.activo).length;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 24px;
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
          .title {
            color: #0d1b2a;
            font-size: 24px;
            font-weight: bold;
            margin: 0;
          }
          .subtitle {
            color: #777;
            font-size: 12px;
            margin-top: 5px;
          }
          .summary-grid {
            display: flex;
            justify-content: space-between;
            margin-bottom: 25px;
            gap: 15px;
          }
          .summary-card {
            flex: 1;
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 12px;
            text-align: center;
          }
          .summary-card .value {
            font-size: 18px;
            font-weight: bold;
            color: #0d1b2a;
            margin-top: 5px;
          }
          .summary-card .label {
            font-size: 10px;
            text-transform: uppercase;
            color: #888;
            letter-spacing: 0.5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 11px;
          }
          th {
            background-color: #0d1b2a;
            color: white;
            text-align: left;
            padding: 10px 8px;
            font-weight: 600;
          }
          td {
            padding: 10px 8px;
            border-bottom: 1px solid #e9ecef;
          }
          tr:nth-child(even) {
            background-color: #fcfcfd;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 10px;
            color: #aaa;
            border-top: 1px solid #eee;
            padding-top: 15px;
          }
          .logo-brand {
            font-weight: 900;
            font-style: italic;
            font-size: 22px;
            color: #0d1b2a;
            line-height: 1;
            letter-spacing: 0.5px;
          }
          .logo-tagline {
            font-weight: 700;
            font-size: 7px;
            color: #777;
            letter-spacing: 0.8px;
            margin-top: 2px;
            text-transform: uppercase;
          }
          .logo-img {
            width: 32px;
            height: 32px;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <table style="width: 100%; border-collapse: collapse; border-bottom: 3px solid #0d1b2a; padding-bottom: 15px; margin-bottom: 20px; border: none;">
          <tr>
            <td style="vertical-align: middle; border: none; padding: 0;">
              <h1 class="title" style="margin: 0; font-size: 24px; font-weight: bold; color: #0d1b2a;">${title}</h1>
              <p class="subtitle" style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Generado el: ${new Date().toLocaleString()}</p>
            </td>
            <td style="text-align: right; vertical-align: middle; border: none; padding: 0;">
              <table style="display: inline-table; border-collapse: collapse; border: none;">
                <tr>
                  <td style="text-align: right; vertical-align: middle; padding-right: 10px; border: none;">
                    <span class="logo-brand">INTTEC</span><br/>
                    <span class="logo-tagline">INTEGRACIÓN DE TECNOLOGÍAS</span>
                  </td>
                  <td style="vertical-align: middle; border: none; padding: 0;">
                    <img class="logo-img" src="${LOGO_BASE64}" style="width: 32px; height: 32px; object-fit: contain;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; border: none;">
          <tr>
            <td style="width: 33%; padding-right: 10px; border: none;">
              <div class="summary-card">
                <div class="label">Total Artículos Catálogo</div>
                <div class="value">${productos.length}</div>
              </div>
            </td>
            <td style="width: 33%; padding-left: 5px; padding-right: 5px; border: none;">
              <div class="summary-card">
                <div class="label">Productos Activos</div>
                <div class="value" style="color: #4CAF50;">${activeProducts}</div>
              </div>
            </td>
            <td style="width: 33%; padding-left: 10px; border: none;">
              <div class="summary-card">
                <div class="label">Total Existencias Stock</div>
                <div class="value" style="color: #1b4965;">${totalStock}</div>
              </div>
            </td>
          </tr>
        </table>

        <table>
          <thead>
            <tr>
              <th style="width: 15%">SKU Interno</th>
              <th style="width: 40%">Nombre Oficial</th>
              <th style="width: 20%">Categoría</th>
              <th style="width: 15%; text-align: right;">Existencias</th>
              <th style="width: 10%">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Documento Confidencial - Control de Inventario INTTEC - Sistema Automatizado
        </div>
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

      const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
      const pdfFileName = `reporte_inventario_${Date.now()}.pdf`;
      const safeUri = `${cacheDirectory}${pdfFileName}`;
      
      await writeAsStringAsync(safeUri, base64 || '', {
        encoding: EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(safeUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar Reporte Inventario PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        throw new Error('La función de compartir no está disponible.');
      }
    } catch (error: any) {
      console.error('Error generating inventory PDF:', error);
      throw new Error(error.message || 'Error al generar el reporte de inventario.');
    }
  },

  /**
   * Genera un archivo CSV de inventario y lo comparte
   */
  async exportInventarioToCSV(
    productos: ReportProducto[],
    categorias: ReportCategoria[],
    fileName: string = 'reporte_inventario.csv'
  ): Promise<void> {
    if (productos.length === 0) {
      throw new Error('No hay productos en el inventario para exportar.');
    }

    const categoriasMap = new Map(categorias.map((c) => [c.id, c.nombre]));

    let csvContent = '\uFEFF'; // BOM
    csvContent += 'SKU Interno,Nombre Oficial,Categoría,Stock Actual,Estado (Activo)\n';

    productos.forEach((p) => {
      const categoriaNombre = categoriasMap.get(p.categoria_id) || 'N/A';
      const escape = (text?: string | null) => {
        if (!text) return '';
        const cleaned = text.replace(/"/g, '""');
        return `"${cleaned}"`;
      };

      const row = [
        escape(p.sku_interno),
        escape(p.nombre_oficial),
        escape(categoriaNombre),
        p.stock_actual,
        p.activo ? 'Activo' : 'Inactivo',
      ].join(',');

      csvContent += row + '\n';
    });

    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const fileUri = `${cacheDirectory}${fileName}`;
      await writeAsStringAsync(fileUri, csvContent, {
        encoding: EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exportar Reporte Inventario CSV',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        throw new Error('La función de compartir no está disponible.');
      }
    } catch (error: any) {
      console.error('Error generating inventory CSV:', error);
      throw new Error(error.message || 'Error al generar reporte CSV.');
    }
  },

  /**
   * Genera un reporte PDF del historial de consumos y lo comparte
   */
  async exportConsumosToPDF(
    consumos: any[],
    title: string = 'Reporte de Consumos de Materiales'
  ): Promise<void> {
    if (consumos.length === 0) {
      throw new Error('No hay registros de consumo para exportar.');
    }

    let tableRows = '';
    consumos.forEach((c) => {
      const fecha = c.fecha ? c.fecha.split('T')[0] : '';
      const productoNombre = c.producto?.nombre_oficial || 'Producto Eliminado';
      const cantidad = c.cantidad || 0;
      const referencia = c.folio_factura || 'N/A';

      tableRows += `
        <tr>
          <td>${fecha}</td>
          <td style="font-weight: bold;">${productoNombre}</td>
          <td style="text-align: right; font-weight: bold; color: #F44336;">-${cantidad} pzas</td>
          <td>${referencia}</td>
        </tr>
      `;
    });

    const totalConsumos = consumos.length;
    const totalPzasConsumidas = consumos.reduce((sum, c) => sum + Number(c.cantidad), 0);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 24px;
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
          .title {
            color: #0d1b2a;
            font-size: 24px;
            font-weight: bold;
            margin: 0;
          }
          .subtitle {
            color: #777;
            font-size: 12px;
            margin-top: 5px;
          }
          .summary-grid {
            display: flex;
            justify-content: space-between;
            margin-bottom: 25px;
            gap: 15px;
          }
          .summary-card {
            flex: 1;
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 12px;
            text-align: center;
          }
          .summary-card .value {
            font-size: 18px;
            font-weight: bold;
            color: #0d1b2a;
            margin-top: 5px;
          }
          .summary-card .label {
            font-size: 10px;
            text-transform: uppercase;
            color: #888;
            letter-spacing: 0.5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 11px;
          }
          th {
            background-color: #0d1b2a;
            color: white;
            text-align: left;
            padding: 10px 8px;
            font-weight: 600;
          }
          td {
            padding: 10px 8px;
            border-bottom: 1px solid #e9ecef;
          }
          tr:nth-child(even) {
            background-color: #fcfcfd;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 10px;
            color: #aaa;
            border-top: 1px solid #eee;
            padding-top: 15px;
          }
          .logo-brand {
            font-weight: 900;
            font-style: italic;
            font-size: 22px;
            color: #0d1b2a;
            line-height: 1;
            letter-spacing: 0.5px;
          }
          .logo-tagline {
            font-weight: 700;
            font-size: 7px;
            color: #777;
            letter-spacing: 0.8px;
            margin-top: 2px;
            text-transform: uppercase;
          }
          .logo-img {
            width: 32px;
            height: 32px;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <table style="width: 100%; border-collapse: collapse; border-bottom: 3px solid #0d1b2a; padding-bottom: 15px; margin-bottom: 20px; border: none;">
          <tr>
            <td style="vertical-align: middle; border: none; padding: 0;">
              <h1 class="title" style="margin: 0; font-size: 24px; font-weight: bold; color: #0d1b2a;">${title}</h1>
              <p class="subtitle" style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Generado el: ${new Date().toLocaleString()}</p>
            </td>
            <td style="text-align: right; vertical-align: middle; border: none; padding: 0;">
              <table style="display: inline-table; border-collapse: collapse; border: none;">
                <tr>
                  <td style="text-align: right; vertical-align: middle; padding-right: 10px; border: none;">
                    <span class="logo-brand">INTTEC</span><br/>
                    <span class="logo-tagline">INTEGRACIÓN DE TECNOLOGÍAS</span>
                  </td>
                  <td style="vertical-align: middle; border: none; padding: 0;">
                    <img class="logo-img" src="${LOGO_BASE64}" style="width: 32px; height: 32px; object-fit: contain;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; border: none;">
          <tr>
            <td style="width: 50%; padding-right: 10px; border: none;">
              <div class="summary-card">
                <div class="label">Total Operaciones Consumo</div>
                <div class="value">${totalConsumos}</div>
              </div>
            </td>
            <td style="width: 50%; padding-left: 10px; border: none;">
              <div class="summary-card">
                <div class="label">Total Piezas Consumidas</div>
                <div class="value" style="color: #F44336;">-${totalPzasConsumidas}</div>
              </div>
            </td>
          </tr>
        </table>

        <table>
          <thead>
            <tr>
              <th style="width: 15%">Fecha</th>
              <th style="width: 45%">Producto</th>
              <th style="width: 15%; text-align: right;">Cantidad</th>
              <th style="width: 25%">Referencia/Trabajo</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Documento Confidencial - Historial de Consumos INTTEC - Sistema Automatizado
        </div>
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

      const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
      const pdfFileName = `reporte_consumos_${Date.now()}.pdf`;
      const safeUri = `${cacheDirectory}${pdfFileName}`;
      
      await writeAsStringAsync(safeUri, base64 || '', {
        encoding: EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(safeUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar Reporte Consumos PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        throw new Error('La función de compartir no está disponible.');
      }
    } catch (error: any) {
      console.error('Error generating consumptions PDF:', error);
      throw new Error(error.message || 'Error al generar el reporte de consumos.');
    }
  },

  /**
   * Genera un archivo CSV de consumos y lo comparte
   */
  async exportConsumosToCSV(
    consumos: any[],
    fileName: string = 'reporte_consumos.csv'
  ): Promise<void> {
    if (consumos.length === 0) {
      throw new Error('No hay registros de consumo para exportar.');
    }

    let csvContent = '\uFEFF'; // BOM
    csvContent += 'ID Movimiento,Fecha,Producto,Cantidad,Referencia/Trabajo\n';

    consumos.forEach((c) => {
      const fecha = c.fecha ? c.fecha.split('T')[0] : '';
      const productoNombre = c.producto?.nombre_oficial || 'Producto Eliminado';
      const escape = (text?: string | null) => {
        if (!text) return '';
        const cleaned = text.replace(/"/g, '""');
        return `"${cleaned}"`;
      };

      const row = [
        c.id,
        fecha,
        escape(productoNombre),
        c.cantidad,
        escape(c.folio_factura),
      ].join(',');

      csvContent += row + '\n';
    });

    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const fileUri = `${cacheDirectory}${fileName}`;
      await writeAsStringAsync(fileUri, csvContent, {
        encoding: EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exportar Reporte Consumos CSV',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        throw new Error('La función de compartir no está disponible.');
      }
    } catch (error: any) {
      console.error('Error generating consumptions CSV:', error);
      throw new Error(error.message || 'Error al generar reporte CSV.');
    }
  },
};
