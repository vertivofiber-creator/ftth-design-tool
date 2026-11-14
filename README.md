# FiberCAD Studio

**FiberCAD Studio** is a web-based **FTTH (Fiber-to-the-Home), GPON, and XGS-PON Network Drawing, GIS Route Planning, and Optical Power Budget Tool**.

Think of it as a lightweight **AutoCAD + Optical Link Budget Calculator + Google/Street Map Fiber Planner** built specifically for fiber optic network engineers, ISPs, students, and telecom planners.

---

## What Is It Used For?

1. **Designing Fiber Optic Network Diagrams (Schematic CAD Mode)**
   - Draw complete end-to-end FTTH topologies from the Central Office (`OLT`, `ODF`, Patch Panels) through Feeder, Distribution, and Drop cables (`PLC Splitters`, `FBT Splitters`, `Ratio Couplers`, `FAT/FDB/FDT`, Joint Closures) down to customer equipment (`ONU`, `ONT`, `Wi-Fi ONT`, Rosette Boxes).
   - Pan (`Ctrl + Drag`, middle-mouse, or Space+Drag), zoom, snap to grid, rotate/resize objects, use layers, undo/redo, and measure distances.

2. **Real-Time Optical Power Budget & Split Ratio Engineering**
   - Set OLT PON transmit power (`+6 dBm`, `+9 dBm`, or custom manufacturer profiles).
   - Configure **PLC Splitters** (`1:2` to `1:64`) and **Asymmetric Ratio Couplers** (`99:1`, `90:10`, `80:20`, `70:30`, `50:50`, or any custom `%` split).
   - Assign custom fiber colors (Red, Blue, Green, Orange, Yellow, Violet, Aqua, White, or any hex color) per input/output port—automatically tinting coupler internals and attached cables.
   - Add/remove input & output ports dynamically, enter standalone reference `dBm` inputs for testing isolated couplers, and view live calculated `dBm` on every port and **`Rx dBm`** badges directly below each ONU.

3. **Real-World Street & Map Routing (GIS Map Mode)**
   - Switch seamlessly between **Street Map (OpenStreetMap)**, **Satellite Imagery (Esri World Imagery)**, and **Dark Street (CARTO)** views with high-zoom support.
   - **Location Search**: Search by street name, address, city, landmark, or exact `latitude, longitude` coordinates, or jump to your current GPS location.
   - **Flexible Fiber Cable Routing**:
     - **Auto Street Mode**: Automatically routes fiber cables along real roads and streets using OSRM and feeds real street distances into your optical loss calculations.
     - **Manual Bend Mode**: Drag cyan bend handles, click anywhere along a cable to insert a new bend, or right-click a handle to remove it.
     - **Individual Bend / Cable Locking**: Lock specific bends/waypoints individually (or lock an entire cable) so moving connected components, dragging unlocked bends, or running street auto-routing never disturbs your locked points.

4. **Automatic FTTH Network Generator**
   - Enter your customer count, OLT/PON port count, splitter ratio (`Centralized`, `Distributed`, `Cascaded`, or `Single-Stage`), and cable capacities to generate a full connected diagram in one click.

5. **Professional Exports & Saving**
   - **PDF Engineering Sheet**: Exports your exact drawing (coupler colors, ratio badges, port `dBm`, ONU `Rx dBm`, dashed underground routes, legend, and title block) plus an optional **Optical Power Budget, Component Port/Ratio/Color & Cable Links Schedule**.
   - **CAD & GIS Formats**: Export to **SVG**, **PNG**, **AutoCAD DXF**, **GeoJSON**, **KML**, or **`.fibercad.json`**, and save/load drawings on the local Express backend.

---

## Technologies Used (Explained Simply)

Each tool in this project plays a clear, simple role:

### Frontend (What You See & Interact With)
| Technology | What It Is (In Simple Terms) | What It Does Here |
|---|---|---|
| **React 19** | A popular JavaScript library for building interactive user interfaces out of reusable components. | Powers the toolbars, canvas, inspector panels, modals, and live diagram updates. |
| **TypeScript** | JavaScript with strict data types so mistakes are caught before running the code. | Ensures nodes, ports, cables, and optical `dBm` calculations stay bug-free and predictable. |
| **Tailwind CSS v4** | A utility-first CSS framework for styling layouts quickly with clean classes. | Styles the dark/light CAD workspace, panels, badges, and responsive controls. |
| **Lucide React** | A clean, lightweight open-source icon library. | Provides crisp CAD, lock, map, cable, and toolbar icons. |
| **Motion** | Smooth animation library for React UI elements. | Handles subtle UI transitions cleanly. |
| **HTML5 SVG** | Scalable Vector Graphics built into every web browser. | Renders crisp telecom symbols, curved/orthogonal fiber lines, port dots, and live `dBm` readouts at any zoom level. |

### GIS Mapping & Routing (Real-World Maps)
| Technology | What It Is (In Simple Terms) | What It Does Here |
|---|---|---|
| **Leaflet** | Lightweight open-source interactive map library for web browsers. | Renders the GIS map, component markers, draggable cable bends, and measurement tools. |
| **OpenStreetMap / CARTO / Esri Tiles** | Free public map tile servers providing street and satellite imagery. | Displays Street, Satellite, and Dark Street base maps (with `maxNativeZoom` overscaling so zooming deep never shows missing-tile errors). |
| **Nominatim API** | Free OpenStreetMap address & place search service. | Powers the GIS location search bar (streets, cities, addresses, and coordinates). |
| **OSRM (Open Source Routing Machine)** | Open-source road/street routing engine. | Automatically snaps fiber cables along real roads and streets between components. |

### Exports & Backend (Saving & File Generation)
| Technology | What It Is (In Simple Terms) | What It Does Here |
|---|---|---|
| **jsPDF** | Client-side PDF generation library. | Generates downloadable A4/A3/Letter CAD engineering PDFs with optical & port configuration schedules. |
| **Node.js + Express** | Lightweight JavaScript web server runtime and framework. | Serves the app and provides `/api/projects` endpoints to save, list, load, and delete drawings in `data/projects.json`. |
| **Vite** | Modern, fast frontend build tool and development server. | Bundles TypeScript/React code for fast development and optimized production builds. |

---

## Project Structure

```text
├── server.ts                  # Express backend + Vite dev middleware + /api/projects persistence
├── index.html                 # HTML entry point and page metadata
├── package.json               # Dependencies and npm scripts
├── .env.example               # Example environment variables (optional)
└── src/
    ├── App.tsx                # Main application state, undo/redo, schematic & GIS coordination
    ├── types/
    │   └── ftth.ts            # TypeScript data models for nodes, ports, cables, layers, and optical paths
    ├── data/
    │   ├── componentCatalog.ts# 30+ FTTH telecom components, presets, ratios, and fiber colors
    │   └── sampleProject.ts   # Starter Metro FTTH Sector 04 sample network
    ├── utils/
    │   ├── opticalCalculator.ts # Downstream/upstream loss, port dBm, and ONU audit engine
    │   ├── gisRouting.ts      # Location search (Nominatim), street routing (OSRM), & bend lock helpers
    │   ├── autoNetworkDesigner.ts # Automatic FTTH topology generator
    │   ├── exportUtils.ts     # PDF, SVG, PNG, DXF, GeoJSON, KML, and JSON exporters
    │   └── gisImportUtils.ts  # GeoJSON & KML file importers
    └── components/
        ├── CadCanvas.tsx      # Interactive SVG schematic CAD workspace
        ├── GisMapCanvas.tsx   # Leaflet GIS map with search, street routing, & per-bend locking
        ├── TelecomSymbol.tsx  # Custom vector symbols for OLT, Splitters, Couplers, FAT, ONU, etc.
        ├── LeftToolbox.tsx    # Draggable/clickable FTTH component library
        ├── RightInspector.tsx # Config, Optical, Ports (% / dBm / Color), and Bend Lock inspector
        ├── TopToolbar.tsx     # Drawing tools, layers, auto-design, zoom, save/load, and export bar
        └── Modals.tsx         # Auto-design wizard, PDF export options, settings, & saved projects modal
```

---

## How to Run Locally

### Prerequisites
- **Node.js** (v18 or newer recommended)
- **npm** (included with Node.js)

### Setup & Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server (runs frontend + Express backend on port 3000):**
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:3000`.

3. **Type-check & build for production:**
   ```bash
   npm run lint
   npm run build
   npm start
   ```

---

## Quick Usage Tips

- **Pan Canvas:** Hold **`Ctrl` + Left Drag** (or Middle Mouse / Space + Drag) anywhere on the schematic canvas.
- **Edit Coupler Split & Colors:** Click any Ratio Coupler or Splitter, open the **Ports** tab in the right panel, and adjust `%` split, loss (`dB`), fiber color, or add/remove ports.
- **Route on Real Streets:** Switch to **GIS Map** mode in the top toolbar, search any street or city, draw a cable in **Auto Street** mode, or switch a cable to **Manual** and **click / double-click** any bend handle to lock it individually.
- **Export Exact Drawing:** Click **Export → PDF** to download a complete CAD sheet with your exact coupler ratios, port colors, live `dBm`, and configuration schedule.
