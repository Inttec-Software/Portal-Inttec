const fs = require('fs');

const codeToAppend = `

export async function exportarFacturaOdooPDF(venta, facturaData, action = 'view') {
  const branding = await getCompanyBranding();
  const title = \`Factura - \${facturaData.folio_number || facturaData.uuid}\`;
  
  // Formatters
  const formatMoney = (val) => \`$ \${Number(val || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}\`;
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return \`\${d.getDate().toString().padStart(2, '0')}/\${(d.getMonth()+1).toString().padStart(2, '0')}/\${d.getFullYear()} \${d.getHours().toString().padStart(2, '0')}:\${d.getMinutes().toString().padStart(2, '0')}\`;
  };

  const htmlContent = \`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>\${title}</title>
      <style>
        @page { size: letter; margin: 0; }
        body { font-family: 'Helvetica', Arial, sans-serif; color: #333; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .page-container { width: 100%; min-height: 100vh; box-sizing: border-box; position: relative; }
        .header-content { padding: 15px 40px 0 40px; display: flex; justify-content: space-between; align-items: flex-start; height: 174px; position: relative; z-index: 10; }
        .company-details { text-align: right; font-size: 11px; line-height: 1.4; color: #333; margin-top: 5px; }
        .page-body { padding: 0px 40px 100px 40px; position: relative; z-index: 10; margin-top: -50px; }
        .row { display: flex; flex-wrap: wrap; margin-bottom: 20px; }
        .col-6 { width: 50%; box-sizing: border-box; }
        .col-7 { width: 58.333333%; box-sizing: border-box; padding-right: 20px; }
        .col-5 { width: 41.666667%; box-sizing: border-box; }
        .text-end { text-align: right; }
        .text-center { text-align: center; }
        .fw-bold { font-weight: bold; }
        .mb-4 { margin-bottom: 24px; }
        .mt-4 { margin-top: 24px; }
        .mt-2 { margin-top: 8px; }
        .ps-1 { padding-left: 2px; }
        .text-muted { color: #6c757d; }
        .inttec-red { color: #8B1D22; }
        .section-header { border-bottom: 2px solid #8B1D22; font-weight: bold; margin-bottom: 8px; color: #8B1D22; text-transform: uppercase; padding-bottom: 3px; font-size: 10px; }
        .table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
        .table-red { border: 1px solid #dee2e6; border-top: none; }
        .table-red thead th { background-color: #8B1D22; color: #FFFFFF !important; padding: 8px 8px; font-size: 10px; border-right: 1px solid #fff; }
        .table-red thead th:last-child { border-right: none; }
        .table-red tbody td { border: 1px solid #dee2e6; padding: 8px; font-size: 10px; }
        .info-text { font-size: 10.5px; line-height: 1.4; color: #333; }
        .table-details { width: 100%; border-collapse: collapse; border: 1px solid #dee2e6; }
        .table-details td { padding: 4px 8px; border: 1px solid #dee2e6; font-size: 10px; }
        .label-col { width: 35%; background-color: #f4f5f6; font-weight: normal; color: #111; }
        .value-col { width: 65%; text-align: right; }
        .table-totals { width: 100%; border-collapse: collapse; }
        .table-totals td { padding: 6px 0; border-bottom: 1px solid #dee2e6; font-size: 11px; }
        .table-totals tr:last-child td { border-bottom: none; border-top: 2px solid #333; font-size: 16px; font-weight: bold; padding-top: 10px; color: #111;}
        .footer-bank { position: relative; border-top: 1px solid #000; padding-top: 10px; font-size: 9px; color: #333; line-height: 1.4; display: flex; justify-content: space-between; margin-top: 40px; margin-bottom: 20px;}
        .footer-bank strong { color: #111; font-weight: bold; }
        .sat-block { margin-top: 30px; border-top: 1px dashed #ccc; padding-top: 20px; display: flex; gap: 20px; page-break-inside: avoid; }
        .sat-qr { width: 130px; height: 130px; flex-shrink: 0; }
        .sat-info { flex: 1; font-size: 7px; color: #555; word-break: break-all; line-height: 1.2; }
        .sat-title { font-weight: bold; color: #333; margin-top: 6px; margin-bottom: 2px; font-size: 8px; text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div class="page-container">
        <!-- HEADER BG ODOO -->
        <div style="position: absolute; top: -90px; left: 0; width: 100%; height: 174px; z-index: 1;">
            <div style="position: absolute; top: 87px; left: 0; width: 100%; height: 0; border-top: 87px solid #EAE6E2;"></div>
            <div style="position: absolute; top: 174px; left: 0; width: 60%; height: 0; border-top: 87px solid #EAE6E2;"></div>
            <div style="position: absolute; top: 174px; left: 60%; width: 0; height: 0; border-top: 87px solid #EAE6E2; border-right: 80px solid transparent;"></div>
        </div>
        
        <div class="header-content">
          <div style="width: 50%;">
            <img src="\${branding.logo}" alt="Logo" style="max-height: 150px; height: 170px; width: 450px; object-fit: contain; margin-top: -10px; z-index: 10; position: relative;">
          </div>
          <div class="company-details" style="width: 50%;">
            <div style="font-weight: bold; font-size: 13px;">\${branding.name}</div>
            <div>RFC: FETR83041461A</div>
            <div>Ozorno 811, 31107 Chihuahua, CHH</div>
            <div>Régimen Fiscal: 612</div>
          </div>
        </div>

        <div class="page-body">
          <div class="row mb-4" style="margin-top: -15px;">
              <div class="col-6"></div>
              <div class="col-6 text-end">
                  <h1 class="inttec-red fw-bold" style="font-size: 26px; letter-spacing: 1px; margin-bottom: 2px; margin-top: 0;">FACTURA</h1>
                  <h2 class="text-muted" style="font-size: 20px; font-weight: normal; margin-top: 0;">\${facturaData.folio_number || (facturaData.uuid ? facturaData.uuid.split('-')[0] : '')}</h2>
              </div>
          </div>

          <div class="row mb-4">
              <div class="col-7">
                  <div class="section-header">Datos del Cliente</div>
                  <div class="info-text ps-1">
                      <strong style="font-size: 11px;">\${facturaData.customer?.legal_name || venta.cliente}</strong><br/>
                      <strong>RFC:</strong> \${facturaData.customer?.tax_id || 'XAXX010101000'}<br/>
                      <strong>CP:</strong> \${facturaData.customer?.address?.zip || ''}<br/>
                      <strong>Régimen Fiscal:</strong> \${facturaData.customer?.tax_system || '616'}<br/>
                      <strong>Uso CFDI:</strong> \${facturaData.use || 'S01'}
                  </div>
              </div>
              <div class="col-5">
                  <div class="section-header">Detalles Comerciales</div>
                  <table class="table-details">
                      <tr><td class="label-col">Fecha Emisión:</td><td class="value-col">\${formatDate(facturaData.created_at)}</td></tr>
                      <tr><td class="label-col">Método de Pago:</td><td class="value-col">\${facturaData.payment_method || 'PUE'}</td></tr>
                      <tr><td class="label-col">Forma de Pago:</td><td class="value-col">\${facturaData.payment_form || '01'}</td></tr>
                      <tr><td class="label-col">Moneda:</td><td class="value-col">MXN</td></tr>
                  </table>
              </div>
          </div>

          <table class="table table-red mt-4">
              <thead>
                  <tr>
                      <th width="15%" class="text-center">CLAVE SAT</th>
                      <th width="40%" style="text-align: left;">DESCRIPCIÓN</th>
                      <th class="text-center">CANT</th>
                      <th class="text-end">PRECIO UNIT</th>
                      <th class="text-center">IVA</th>
                      <th class="text-end">IMPORTE</th>
                  </tr>
              </thead>
              <tbody>
                  \${(facturaData.items || []).map((item) => \`
                      <tr>
                          <td class="text-center">\${item.product?.product_key || ''}<br/><span style="font-size: 8px;">(\${item.product?.unit_key || ''})</span></td>
                          <td>\${item.product?.description || ''}</td>
                          <td class="text-center">\${item.quantity}</td>
                          <td class="text-end">\${formatMoney(item.product?.price)}</td>
                          <td class="text-center">16%</td>
                          <td class="text-end">\${formatMoney((item.quantity || 0) * (item.product?.price || 0))}</td>
                      </tr>
                  \`).join('')}
              </tbody>
          </table>

          <div class="row mt-4">
              <div class="col-7">
                  <div class="info-text mt-2">
                      <div class="section-header">Informacion Adicional</div>
                      <div style="padding-top: 4px;">Este documento es una representación impresa de un CFDI 4.0</div>
                  </div>
              </div>
              <div class="col-5">
                  <table class="table-totals">
                      <tr><td>Subtotal</td><td class="text-end">\${formatMoney(facturaData.subtotal || venta.subtotal_venta)}</td></tr>
                      <tr><td>IVA Trasladado</td><td class="text-end">\${formatMoney(facturaData.taxes?.[0]?.amount || (venta.subtotal_venta * 0.16))}</td></tr>
                      <tr><td>TOTAL</td><td class="text-end">\${formatMoney(facturaData.total || (venta.subtotal_venta * 1.16))}</td></tr>
                  </table>
              </div>
          </div>

          <!-- SAT Block -->
          \${facturaData.uuid ? \`
          <div class="sat-block">
            \${facturaData.status === 'canceled' ? '<div style="position: absolute; top: 40%; left: 30%; transform: rotate(-45deg); font-size: 100px; color: rgba(255,0,0,0.15); font-weight: bold; border: 10px solid rgba(255,0,0,0.15); border-radius: 20px; padding: 20px; z-index: -1;">CANCELADO</div>' : ''}
            <div class="sat-qr">
              <img src="\${facturaData.verification_url ? \`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=\${encodeURIComponent(facturaData.verification_url)}\` : 'https://via.placeholder.com/150?text=QR'}" style="width: 100%; height: 100%;" />
            </div>
            <div class="sat-info">
              <div class="sat-title">Folio Fiscal (UUID)</div>
              <div>\${facturaData.uuid}</div>
              
              <div class="sat-title">No. Certificado SAT</div>
              <div>\${facturaData.stamp?.sat_cert_number || ''}</div>

              <div class="sat-title">Sello Digital del Emisor</div>
              <div>\${facturaData.stamp?.signature || ''}</div>

              <div class="sat-title">Sello Digital del SAT</div>
              <div>\${facturaData.stamp?.sat_signature || ''}</div>

              <div class="sat-title">Cadena Original del Complemento de Certificación Digital del SAT</div>
              <div>\${facturaData.stamp?.original_chain || ''}</div>
            </div>
          </div>
          \` : ''}
          
          <div class="footer-bank">
            <div style="width: 40%;">
              <strong>RAFAEL ALONSO FERNANDEZ TINAJERO</strong><br>
              RFC: FETR83041461A<br>
              TEL: 6142477119<br>
              MAIL: rfernandez@inttec.net
            </div>
            <div style="width: 45%;">
              <strong>CUENTA BANCARIA BBVA</strong><br>
              NO. CUENTA: 0193092593<br>
              CLABE: 012150001930925930<br>
              CUENTAHABIENTE: Rafael Alonso Fernandez Tinajero
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  \`;

  try {
    if (Platform.OS === 'web') {
      if (action === 'download') {
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

          iframe.onload = () => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 1000);
          };
        }
      } else {
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.write(htmlContent);
          newWindow.document.close();
        }
      }
    } else {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      
      const customNameUri = \`\${FileSystem.cacheDirectory}Factura_\${facturaData.folio_number || facturaData.uuid || venta.id}.pdf\`;
      
      await FileSystem.copyAsync({
        from: uri,
        to: customNameUri,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(customNameUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Compartir Factura CFDI'
        });
      } else {
        throw new Error('La función de compartir no está disponible.');
      }
    }
  } catch (error) {
    logger.error('Error generando PDF de factura:', error);
    if (Platform.OS === 'web') {
      window.alert('Error: No se pudo generar el documento PDF. ' + (error.message || ''));
    } else {
      Alert.alert('Error', 'No se pudo generar el documento PDF. ' + (error.message || ''));
    }
  }
}
`;

fs.appendFileSync('src/utils/reportGenerator.ts', codeToAppend);
console.log('Appended successfully');
