export const buildMapHtml = (lat: number, lng: number) => {
  if (!lat || !lng) {
    return `
      <html>
        <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100%;background:#EAF2FF;font-family:-apple-system,sans-serif;">
          <div style="text-align:center;color:#64748B;">
            <p style="font-size:14px;">Location unavailable</p>
          </div>
        </body>
      </html>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        />
        <style>
          html, body, #map {
            margin: 0;
            padding: 0;
            height: 100%;
            width: 100%;
            background: #EAF2FF;
          }
          .leaflet-control-attribution {
            font-size: 9px;
            background: rgba(255,255,255,0.7);
            backdrop-filter: blur(8px);
            border-radius: 8px;
            padding: 2px 6px;
          }
          .leaflet-control-attribution a {
            color: #64748B;
          }
          .pulse-marker {
            position: relative;
            width: 24px;
            height: 24px;
          }
          .pulse-marker .dot {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 16px;
            height: 16px;
            background: #0066FF;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 4px 12px rgba(0,102,255,0.5);
            z-index: 2;
          }
          .pulse-marker .ring {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 24px;
            height: 24px;
            background: #0066FF;
            border-radius: 50%;
            opacity: 0.4;
            animation: pulse 1.8s ease-out infinite;
            z-index: 1;
          }
          @keyframes pulse {
            0% { width: 24px; height: 24px; opacity: 0.5; }
            100% { width: 80px; height: 80px; opacity: 0; }
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script>
          const lat = ${lat};
          const lng = ${lng};

          const map = L.map('map', {
            zoomControl: false,
            attributionControl: true,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            touchZoom: false,
          }).setView([lat, lng], 17);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap',
          }).addTo(map);

          const markerIcon = L.divIcon({
            className: '',
            html: '<div class="pulse-marker"><div class="ring"></div><div class="dot"></div></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });

          L.marker([lat, lng], { icon: markerIcon }).addTo(map);
        </script>
      </body>
    </html>
  `;
};