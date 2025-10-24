// app.js
const Store = new (class extends EventTarget {
  state = { allItems: [], filtered: [], countries: [], filterCountry: 'All', search: '', activeId: null };
  set(p){ this.state = { ...this.state, ...p }; this.dispatchEvent(new CustomEvent('state',{detail:this.state})); }
  recompute(){
    const { allItems, filterCountry, search } = this.state;
    const s = (search||'').trim().toLowerCase();
    let out = allItems.slice();
    if (filterCountry && filterCountry !== 'All') out = out.filter(i => (i.country||'').toLowerCase() === filterCountry.toLowerCase());
    if (s) out = out.filter(i => (i.title||'').toLowerCase().includes(s) || (i.city||'').toLowerCase().includes(s) || (i.notes||'').toLowerCase().includes(s));
    out.sort((a,b)=> new Date(a.start_date) - new Date(b.start_date));
    this.set({ filtered: out });
  }
})();
const statusColor = (status) => (String(status||'').toLowerCase()==='booked' ? '#16a34a' : '#2563eb');
const statusBadgeClass = (status) => (String(status||'').toLowerCase()==='booked' ? 'booked' : 'planned');
const dateRange = (a,b)=>{ if(!a) return ''; const d1=new Date(a); const opts={year:'numeric',month:'short',day:'numeric'}; const left=isFinite(d1)?d1.toLocaleDateString(undefined,opts):a; if(!b)return left; const d2=new Date(b); const right=isFinite(d2)?d2.toLocaleDateString(undefined,opts):b; return `${left} → ${right}`; };

class HVApp extends HTMLElement {
  connectedCallback() {
    this.attachShadow({mode:'open'});
    // Inject Leaflet CSS into Shadow DOM
    const leafletCssLink = document.createElement('link');
    leafletCssLink.rel = 'stylesheet';
    leafletCssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    leafletCssLink.crossOrigin = '';
    this.shadowRoot.appendChild(leafletCssLink);

    // Add basic styles for layout
    const style = document.createElement('style');
    style.textContent = `
      .container {
        display: grid;
        grid-template-columns: 1.2fr 1fr;
        gap: 16px;
        min-height: calc(100vh - 80px);
        margin-top: 16px;
      }
      @media (max-width: 700px) {
        .container {
          display: block;
        }
        .map-wrap {
          margin-bottom: 16px;
        }
        .sidebar {
          min-width: 0;
          margin-top: 0;
        }
      }
      .map-wrap {
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 2px 10px rgba(0,0,0,.03);
        overflow: hidden;
      }
      .sidebar {
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 2px 10px rgba(0,0,0,.03);
        padding: 18px;
        display: flex;
        flex-direction: column;
        min-width: 220px;
      }
      .toolbar {
        display: flex;
        gap: 8px;
        align-items: center;
        padding-bottom: 12px;
        border-bottom: 1px solid #eef2f7;
        margin-bottom: 12px;
      }
      .toolbar select,
      .toolbar input[type=search] {
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid #d1d5db;
        background: #fff;
      }
      .legend {
        margin-left: auto;
        display: flex;
        gap: 12px;
        font-size: 12px;
        color: #6b7280;
      }
      .dot {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        display: inline-block;
        vertical-align: middle;
        margin-right: 6px;
      }
      .dot.green { background: #16a34a; }
      .dot.blue { background: #2563eb; }
      .list {
        overflow: auto;
        flex: 1;
        margin-top: 10px;
        padding: 8px 10px 14px;
      }
      .item {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 12px;
        align-items: center;
        padding: 10px;
        border: 1px solid #eef2f7;
        border-radius: 12px;
        margin: 10px 2px;
        cursor: pointer;
        transition: box-shadow .15s ease;
        background: #fff;
      }
      .item:hover {
        box-shadow: 0 4px 12px rgba(0,0,0,.06);
      }
      .item.active {
        outline: 2px solid #245cff;
      }
      .badge {
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .3px;
      }
      .badge.booked {
        background: #dcfce7;
        color: #166534;
      }
      .badge.planned {
        background: #dbeafe;
        color: #1e40af;
      }
      .title {
        font-weight: 800;
      }
      .muted {
        color: #6b7280;
        font-size: 12px;
      }
      header.site {
        position: sticky;
        top: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 14px 18px;
        background: #fff;
        box-shadow: 0 1px 0 rgba(0,0,0,.06);
      }
      header .logo {
        font-weight: 900;
        letter-spacing: .5px;
        font-size: 20px;
        color: #0b1b4a;
      }
      header nav {
        display: flex;
        gap: 8px;
        margin-left: 8px;
      }
      .tab-btn {
        appearance: none;
        border: 1px solid #e5e7eb;
        background: #fff;
        color: #1b2233;
        padding: 8px 12px;
        border-radius: 999px;
        cursor: pointer;
        font-weight: 600;
      }
      .tab-btn[aria-selected=true] {
        background: #eef2ff;
        border-color: #c7d2fe;
        color: #0b1b4a;
      }
    `;
    this.shadowRoot.appendChild(style);

    // Add header
    const header = document.createElement('header');
    header.className = 'site';
    header.innerHTML = `
      <div class="logo">Heesen Voyage</div>
      <nav>
        <button class="tab-btn" data-tab="map" aria-selected="true">Maps</button>
        <button class="tab-btn" data-tab="notes" aria-selected="false">Notes</button>
      </nav>
    `;
    this.shadowRoot.appendChild(header);

    // Add main container
    const container = document.createElement('div');
    container.className = 'container';
    this.shadowRoot.appendChild(container);

    // Map section
    const mapWrap = document.createElement('div');
    mapWrap.className = 'map-wrap';
    container.appendChild(mapWrap);
    const mapDiv = document.createElement('div');
    mapDiv.id = 'map';
    mapDiv.style.width = '100%';
    mapDiv.style.height = '540px';
    mapDiv.style.borderRadius = '16px';
    mapDiv.style.background = '#e5e7eb';
    mapWrap.appendChild(mapDiv);

    // Sidebar section with previous contents
    const sidebar = document.createElement('div');
    sidebar.className = 'sidebar';
    sidebar.innerHTML = `
      <div class="toolbar">
        <label>Country:
          <select id="countrySel">
            <option value="All">All</option>
          </select>
        </label>
        <input id="search" type="search" placeholder="Search places/notes…" />
        <div class="legend">
          <span><span class="dot green"></span>Booked</span>
          <span><span class="dot blue"></span>Planned</span>
        </div>
      </div>
      <div class="list" id="list"></div>
    `;
    container.appendChild(sidebar);

    // Initialize map
    this.map = L.map(mapDiv, { zoomControl: true });
    this.map.setView([0, 0], 1); // Minimum zoom for world view
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(this.map);
    setTimeout(() => this.map.invalidateSize(), 100);
    // Log current zoom level after map is ready
    this.map.whenReady(() => {
      console.log('[Leaflet] Initial zoom:', this.map.getZoom());
    });
    // Log zoom level on zoom events
    this.map.on('zoomend', () => {
      console.log('[Leaflet] Zoom changed:', this.map.getZoom());
    });

    // Sidebar controls
    this.countrySel = this.shadowRoot.getElementById('countrySel');
    this.searchInput = this.shadowRoot.getElementById('search');
    this.listEl = this.shadowRoot.getElementById('list');

    this.countrySel.addEventListener('change', () => {
      Store.set({filterCountry: this.countrySel.value});
      Store.recompute();
      this.renderMapMarkers();
    });
    this.searchInput.addEventListener('input', () => {
      Store.set({search: this.searchInput.value});
      Store.recompute();
      this.renderMapMarkers();
    });
    Store.addEventListener('state', () => this.renderList());

    this.renderList();
    this.loadCSV('./data/itinerary-with-coords.csv');
  }

  renderList() {
    const { filtered, activeId } = Store.state;
    const container = this.listEl;
    container.innerHTML = '';
    // Track expanded groups by index
    if (!this._expandedGroups) this._expandedGroups = new Set();
    // Group consecutive items by title and country
    let groups = [];
    let currentGroup = null;
    for (const item of filtered) {
      if (
        currentGroup &&
        currentGroup.title === (item.title || item.city || '(Unnamed stop)') &&
        currentGroup.country === (item.country || '')
      ) {
        currentGroup.items.push(item);
      } else {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = {
          title: item.title || item.city || '(Unnamed stop)',
          country: item.country || '',
          items: [item]
        };
      }
    }
    if (currentGroup) groups.push(currentGroup);

    groups.forEach((group, idx) => {
      const isGrouped = group.items.length > 1;
      const groupId = `group-${idx}`;
      const groupEl = document.createElement('div');
      groupEl.className = 'item-group';
      groupEl.innerHTML = `
        <div class="item group-header" style="cursor:pointer;display:flex;align-items:center;" data-group="${groupId}">
          ${isGrouped ? `<span class="chevron" style="margin-right:8px;transition:transform 0.2s;">&#9654;</span>` : ''}
          <div>
            <div class="title">${group.title}</div>
            <div class="muted">${group.country}</div>
            <div class="muted">${dateRange(group.items[0].start_date, group.items[group.items.length-1].end_date)}</div>
          </div>
        </div>
        <div class="group-items" style="display:none;padding-left:24px;"></div>
      `;
      if (isGrouped) {
        const header = groupEl.querySelector('.group-header');
        const chevron = groupEl.querySelector('.chevron');
        const itemsContainer = groupEl.querySelector('.group-items');
        // Restore expanded state
        if (this._expandedGroups.has(idx)) {
          itemsContainer.style.display = 'block';
          if (chevron) chevron.style.transform = 'rotate(90deg)';
        }
        header.addEventListener('click', () => {
          const expanded = itemsContainer.style.display === 'block';
          itemsContainer.style.display = expanded ? 'none' : 'block';
          if (chevron) chevron.style.transform = expanded ? 'rotate(0deg)' : 'rotate(90deg)';
          if (!expanded) this._expandedGroups.add(idx);
          else this._expandedGroups.delete(idx);
        });
        // Render grouped items
        group.items.forEach(item => {
          const el = document.createElement('div');
          el.className = 'item' + (activeId === item.id ? ' active' : '');
          el.dataset.id = item.id;
          el.style.borderLeft = '2px solid #e5e7eb';
          el.style.margin = '4px 0';
          el.innerHTML = `
            <div class="badge ${statusBadgeClass(item.status)}">${(item.status||'planned').toUpperCase()}</div>
            <div>
              <div class="muted">${dateRange(item.start_date,item.end_date)}</div>
              ${item.notes?`<div class="muted">${item.notes}</div>`:''}
            </div>
            <div class="muted">${Number(item.km||0)?`${item.km} km`:''}</div>`;
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            Store.set({activeId: item.id});
            // Do not re-render the list, just update active and focus marker
            this.focusMapMarker(item.id);
            // Update active class
            container.querySelectorAll('.item').forEach(i => i.classList.remove('active'));
            el.classList.add('active');
          });
          itemsContainer.appendChild(el);
        });
      } else {
        // Single item, render as before
        const item = group.items[0];
        const el = groupEl.querySelector('.group-header');
        el.className += (activeId === item.id ? ' active' : '');
        el.dataset.id = item.id;
        el.addEventListener('click', () => {
          Store.set({activeId: item.id});
          this.renderList();
          this.focusMapMarker(item.id);
        });
        // Add notes if present
        if (item.notes) {
          const notesDiv = document.createElement('div');
          notesDiv.className = 'muted';
          notesDiv.textContent = item.notes;
          groupEl.appendChild(notesDiv);
        }
      }
      container.appendChild(groupEl);
    });
    // Update country selector
    const opts = ['All', ...Store.state.countries];
    this.countrySel.innerHTML = opts.map(c => `<option value="${c}">${c}</option>`).join('');
    this.countrySel.value = Store.state.filterCountry || 'All';
  }

  async loadCSV(url) {
    await new Promise(r => { const check = () => (window.Papa && window.L) ? r() : setTimeout(check, 30); check(); });
    const res = await fetch(url); const text = await res.text();
    const parsed = Papa.parse(text, {header:true, dynamicTyping:true, skipEmptyLines:true}); let rows = parsed.data;
    const pick = (row, keys, def='') => { for (const k of keys) { for (const v of [k, k.toLowerCase(), k.toUpperCase()]) { if (v in row) return row[v]; } } return def; };
    rows = rows.map((r, i) => {
        const rawStatus = pick(r,['status','booked','isBooked']);
        const bookedRaw = (rawStatus !== null && rawStatus !== undefined ? rawStatus : '').toString().trim().toLowerCase();
        const booked = ['booked','true','yes','1'].includes(bookedRaw);
        const rawCountry = pick(r,['country','Country ']);
        const country = (rawCountry !== null && rawCountry !== undefined ? rawCountry : '').toString().trim();
        const lat = Number(pick(r,['lat','latitude','Lat']));
        const lng = Number(pick(r,['lng','long','longitude','Lon','Long']));
        // Only return item if both lat and lng are valid numbers
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          id: String(pick(r,['id'],i+1)),
          title: pick(r,['title','stop','place','location']),
          city: pick(r,['city','town','area','Town/Area']),
          country: country,
          lat: lat,
          lng: lng,
          start_date: pick(r,['start_date','start','date','Date']),
          end_date: pick(r,['end_date','end','DateEnd']),
          status: booked ? 'booked' : (pick(r,['status'])||'planned'),
          km: pick(r,['km','distance_km']),
          notes: pick(r,['notes','comment','Description']),
          address: pick(r,['address','Address'])
      };
    }).filter(r => r !== null);
    debugger;
    const countries = Array.from(new Set(rows.map(r=>r.country).filter(Boolean))).sort();
    Store.set({ allItems: rows, countries }); Store.recompute(); this.renderMapMarkers(true);
    // If no data, reset to world view
    if (rows.length === 0) {
      this.map.setView([0, 0], 1);
    }
  }

  renderMapMarkers(fit=false) {
    if (!this.map) return;
    if (this.markers) { this.markers.forEach(m => this.map.removeLayer(m)); this.markers.clear(); }
    else { this.markers = new Map(); }
    if (this.polyline) { this.map.removeLayer(this.polyline); this.polyline = null; }
    const latlngs = [];
    const transportSegments = [];
    let prevItem = null;
    for (const item of Store.state.filtered) {
        if (item.lat === 0 && item.lng === 0) continue;
        const color = statusColor(item.status);
        const marker = L.circleMarker([item.lat, item.lng], {radius:8, color, weight:2, fillColor:color, fillOpacity:.7}).addTo(this.map);
        marker.bindPopup(`<strong>${item.title||item.city||''}</strong><br/>${item.city?item.city+', ':''}${item.country||''}<br/><small>${dateRange(item.start_date,item.end_date)}</small><br/><em>${item.status}</em>${item.notes?`<br/><small>${item.notes}</small>`:''}`);
        marker.on('click', () => {
          Store.set({activeId: item.id});
          this.renderList();
        });
        this.markers.set(item.id, marker); latlngs.push([item.lat, item.lng]);
        if (prevItem) {
          // Show means of transport between prevItem and item
          const transport = item.transport || prevItem.transport || '';
          const segment = L.polyline([[prevItem.lat, prevItem.lng], [item.lat, item.lng]], {color:'#334155', weight:3, opacity:.6, dashArray:'4 6'}).addTo(this.map);
          if (transport) {
            segment.bindTooltip(transport, {permanent: false, direction: 'center', className: 'transport-label'});
          }
          transportSegments.push(segment);
        }
        prevItem = item;
    }
    // Optionally fit bounds to all points
    if (fit && latlngs.length) { this.map.fitBounds(L.latLngBounds(latlngs).pad(0.2)); this.map.invalidateSize(); }
  }

  focusMapMarker(id) {
    if (!this.markers) return;
    const marker = this.markers.get(id);
    if (marker) {
      this.map.setView(marker.getLatLng(), 8);
      marker.setRadius(12);
      setTimeout(() => { if (this.markers) this.markers.forEach(m => { if (m !== marker) m.setRadius(8); }); }, 100);
    }
  }
}

customElements.define('hv-app', HVApp);
window.Store = Store;
