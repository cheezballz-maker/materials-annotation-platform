import React from "react";
import { createRoot } from "react-dom/client";
import ReactFlow, { applyNodeChanges, Background, Edge, MarkerType, Node as FlowNode, Position, SelectionMode, type EdgeProps, type NodeChange, type ReactFlowInstance, type Viewport } from "reactflow";
import "reactflow/dist/style.css";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Edit3,
  FolderOpen,
  GitBranch,
  Link2,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X
} from "lucide-react";
import "./styles.css";

type Status = "Unannotated" | "Partially complete" | "Completed";
type EntityType = "substances" | "compositions" | "properties" | "measurements";
type SourceType = "patent" | "paper";
type SubstanceType = "canonical" | "commercial" | "formula" | "raw";
type ConstituentStatus = "included" | "excluded" | "optional" | "-";
type AmountComparator = "=" | ">" | "<" | ">=" | "<=" | "approx" | "range" | "balance" | "-";
type KeyConstituent = "yes" | "no" | "-";
type PropertyType = "intrinsic" | "extrinsic" | "performance";
type MeasurementType = "quantitative" | "qualitative";
type Comparator = "=" | ">" | "<" | ">=" | "<=" | "approx" | "range" | "-";
type EvidenceSpan = { field: string; text: string; start?: number | null; end?: number | null; primary?: boolean };
type Meta = { source_type: SourceType; source_id: string };
type SubstanceRecord = { node_no: number; substance_name: string; substance_type: SubstanceType; physical_form: string; manufacturer: string; evidence_text: string; evidence_spans: EvidenceSpan[] };
type ConstituentRecord = { constituent_ref: number; constituent_status: ConstituentStatus; amount_comparator: AmountComparator; amount_value: string | number; amount_unit: string; amount_lower_value: string | number; amount_upper_value: string | number; function: string; key_constituent: KeyConstituent; key_reason: string };
type CompositionRecord = { node_no: number; composition_name: string; composition_type: string; physical_form: string; constituents: ConstituentRecord[]; evidence_text: string; evidence_spans: EvidenceSpan[] };
type PropertyRecord = { node_no: number; property_name: string; property_type: PropertyType; target_ref: number; evidence_text: string; evidence_spans: EvidenceSpan[] };
type MeasurementCondition = { condition_name: string; condition_value: Array<string | number>; condition_unit: string[] };
type MeasurementRecord = { node_no: number; measurement_type: MeasurementType; property_ref: number; value: Array<string | number>; comparator: Comparator; unit: string[]; lower_value: string | number; upper_value: string | number; measurement_conditions: MeasurementCondition[]; evidence_text: string; evidence_spans: EvidenceSpan[] };
type GraphPosition = { x: number; y: number };
type GraphLayout = Record<string, GraphPosition>;
type AnnotationState = { document_id: string; patent_id: string; status: Status; meta: Meta; substances: SubstanceRecord[]; compositions: CompositionRecord[]; properties: PropertyRecord[]; measurements: MeasurementRecord[]; graph_layout: GraphLayout };
type FileSummary = { kind?: "file" | "folder"; document_id: string; patent_id: string; status: Status; counts: Record<EntityType, number>; annotation_path?: string | null; updated_at: number; path?: string | null };
type WorkspacePayload = { path: string | null; parent_path?: string | null; configured_workspace?: boolean; files: FileSummary[] };
type LoadedDoc = { document_id: string; patent_id: string; markdown: string; state: AnnotationState; annotation_path?: string | null; revision?: string };
type ActiveRecord = { type: EntityType; nodeNo: number } | null;
type SelectionMenu = { id: string; text: string; start: number; end: number } | null;
type SpanFocus = { type: EntityType; nodeNo: number; index: number } | null;
type GraphRef = { type: EntityType; nodeNo: number };
type AnyRecord = SubstanceRecord | CompositionRecord | PropertyRecord | MeasurementRecord;
type AnnotationTarget = { field: string; label: string; kind: "text" | "stringArray" | "mixedArray" };
type RelationshipEdge = { id: string; source: GraphRef; target: GraphRef; label: string };
type GraphEdgeData = { siblingOffset?: number; sourceAnchorOffset?: number; targetAnchorOffset?: number; relationship: RelationshipEdge | null; onSelect?: (edge: RelationshipEdge | null) => void; simpleMode?: boolean; lowDetail?: boolean };
type GraphNodeGroup = { type: EntityType; nodeNos: number[] };
type AnnotatedSpan = EvidenceSpan & { entityType: EntityType; nodeNo: number; index: number; identity: boolean };
type HighlightSpan = AnnotatedSpan | (EvidenceSpan & { entityType: "pending"; nodeNo: -1; index: -1; identity: false });
type SpanInspector = { x: number; y: number; text: string; spans: AnnotatedSpan[] } | null;
type SpanAdjustment = { type: EntityType; nodeNo: number; field: string; index: number } | null;
type UndoSnapshot = { state: AnnotationState; activeTab: EntityType; activeRecord: ActiveRecord; editingRecord: ActiveRecord; documentSelectedRecord: ActiveRecord; spanFocus: SpanFocus };
type SaveState = "Saved" | "Unsaved changes";
type GraphViewport = Viewport;
type GraphFilterState = Record<EntityType, boolean>;
type NodeRelationshipFilterKey = "default" | "measurementUnlinked" | "targetUnlinked";
type NodeRelationshipFilterState = Partial<Record<EntityType, Partial<Record<NodeRelationshipFilterKey, boolean>>>>;
type LinkCandidate = { type: EntityType; nodeNo: number; title: string; meta?: string };
type PendingFieldCommit = () => void;
type PendingFieldCommitRegistry = { register: (id: string, commit: PendingFieldCommit | null) => void; markDirty: () => void };
type RecordPatch = Record<string, unknown> | ((record: AnyRecord) => Record<string, unknown>);
type ExportAnnotationEntry = { type: EntityType; nodeNo: number; nodeId: string; category: string; title: string; field: string; rows: Array<{ label: string; value: string }> };

const DEFAULT_FOLDER = String.raw`C:\Users\IT PatsnapSG\OneDrive - Patsnap\13. PatSnap\10. Testing & Evaluation\5. PDF Parser\output_md`;
const GRAPH_NODE_EXPANDED_WIDTH = 360;
const GRAPH_NODE_EXPANDED_HEIGHT = 58;
const GRAPH_NODE_OVERVIEW_WIDTH = 56;
const GRAPH_NODE_OVERVIEW_HEIGHT = 16;
const GRAPH_LANE_WIDTH = 430;
const GRAPH_LANE_HEIGHT = 1320;
const GRAPH_LANE_TOP = 44;
const GRAPH_LARGE_NODE_THRESHOLD = 400;
const GRAPH_LOW_DETAIL_ZOOM = 0.32;
const LINK_CANDIDATE_LIMIT = 60;
const DEFAULT_SOURCE_PANEL_WIDTH = 52;
const MIN_SOURCE_PANEL_WIDTH_PX = 300;
const MIN_ANNOTATION_PANEL_WIDTH_PX = 340;
const PANEL_RESIZE_HANDLE_WIDTH_PX = 8;
const GRAPH_LANE_X: Record<EntityType, number> = {
  substances: 60,
  compositions: 760,
  properties: 1460,
  measurements: 2160
};

const labels: Record<EntityType, string> = {
  substances: "Substances",
  compositions: "Compositions",
  properties: "Properties",
  measurements: "Measurements"
};

const PendingFieldCommitContext = React.createContext<PendingFieldCommitRegistry>({ register: () => {}, markDirty: () => {} });

const entityOrder: EntityType[] = ["substances", "compositions", "properties", "measurements"];

const colors: Record<EntityType, string> = {
  substances: "#15803d",
  compositions: "#0891b2",
  properties: "#9333ea",
  measurements: "#c2410c"
};

const emptyState = (document_id = "", patent_id = ""): AnnotationState => ({
  document_id,
  patent_id,
  status: "Unannotated",
  meta: { source_type: "patent", source_id: patent_id || "-" },
  substances: [],
  compositions: [],
  properties: [],
  measurements: [],
  graph_layout: {}
});

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.detail || `Request failed with status ${response.status}`);
  return payload as T;
}

function BrandGlyph({ className = "" }: { className?: string }) {
  const flowId = React.useId().replace(/:/g, "");
  const softId = React.useId().replace(/:/g, "");
  const sideId = React.useId().replace(/:/g, "");
  const glowId = React.useId().replace(/:/g, "");

  return <svg viewBox="0 0 84 84" role="presentation" className={className}>
    <defs>
      <linearGradient id={flowId} x1="18" y1="68" x2="66" y2="18" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#8ee6bd" />
        <stop offset="22%" stopColor="#8bd7f0" />
        <stop offset="48%" stopColor="#cdbdff" />
        <stop offset="72%" stopColor="#f5d982" />
        <stop offset="100%" stopColor="#8fe3cf" />
      </linearGradient>
      <linearGradient id={softId} x1="24" y1="58" x2="64" y2="30" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#b7f0d4" />
        <stop offset="36%" stopColor="#afe5f5" />
        <stop offset="72%" stopColor="#f7dea0" />
        <stop offset="100%" stopColor="#dac9ff" />
      </linearGradient>
      <linearGradient id={sideId} x1="20" y1="62" x2="70" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#f7df8f" />
        <stop offset="50%" stopColor="#a8ead1" />
        <stop offset="100%" stopColor="#92def3" />
      </linearGradient>
      <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.75" result="blurred" />
        <feColorMatrix in="blurred" type="matrix" values="1 0 0 0 .02  0 1 0 0 .03  0 0 1 0 .04  0 0 0 .34 0" result="softGlow" />
        <feMerge>
          <feMergeNode in="softGlow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <g className="brand-a-assembly" filter={`url(#${glowId})`}>
      <path
        className="brand-a-ribbon brand-a-ribbon-outer"
        style={{ stroke: `url(#${flowId})` }}
        d="M20 72C25 60 29 52 36 34C39 26 42 20 46 18C50 20 53 26 56 34C63 52 67 60 72 72"
      >
        <animate
          attributeName="d"
          dur="7.8s"
          repeatCount="indefinite"
          values="
            M20 72C25 60 29 52 36 34C39 26 42 20 46 18C50 20 53 26 56 34C63 52 67 60 72 72;
            M18 70C24 58 31 48 38 36C42 29 44 23 47 22C50 24 52 30 55 38C60 50 65 60 74 70;
            M22 74C28 61 30 48 36 30C40 22 42 18 46 16C50 18 53 22 58 30C64 48 66 60 70 74;
            M19 71C26 62 33 54 41 40C44 33 46 28 47 25C48 28 50 33 53 40C61 54 68 62 73 71;
            M20 72C25 60 29 52 36 34C39 26 42 20 46 18C50 20 53 26 56 34C63 52 67 60 72 72
          "
        />
      </path>
      <path
        className="brand-a-ribbon brand-a-ribbon-inner"
        d="M34 66C36 55 38 46 41 36C43 29 44 24 46 20C48 26 50 34 53 44C56 52 61 59 67 66"
      >
        <animate
          attributeName="d"
          dur="7.8s"
          repeatCount="indefinite"
          values="
            M34 66C36 55 38 46 41 36C43 29 44 24 46 20C48 26 50 34 53 44C56 52 61 59 67 66;
            M33 64C35 54 38 46 41 39C43 32 44 27 46 24C49 30 52 39 55 47C58 54 63 60 69 64;
            M36 68C38 57 40 49 43 38C45 31 46 26 46 22C47 28 49 38 51 47C54 56 58 63 64 69;
            M34 62C37 52 40 44 43 32C44 27 45 22 46 19C50 26 53 35 56 42C60 50 64 57 70 65;
            M34 66C36 55 38 46 41 36C43 29 44 24 46 20C48 26 50 34 53 44C56 52 61 59 67 66
          "
        />
      </path>
      <path
        className="brand-a-ribbon brand-a-ribbon-cross"
        style={{ stroke: `url(#${softId})` }}
        d="M28 50C33 44 39 42 46 42C53 42 59 44 64 50"
      >
        <animate
          attributeName="d"
          dur="7.8s"
          repeatCount="indefinite"
          values="
            M28 50C33 44 39 42 46 42C53 42 59 44 64 50;
            M26 52C32 46 39 44 46 44C53 44 60 46 66 52;
            M30 46C35 40 40 38 46 38C52 38 57 40 62 46;
            M28 48C33 43 39 40.5 46 40.5C53 40.5 59 43 64 48;
            M28 50C33 44 39 42 46 42C53 42 59 44 64 50
          "
        />
      </path>
      <path
        className="brand-a-ribbon brand-a-ribbon-side"
        style={{ stroke: `url(#${sideId})` }}
        d="M21 60C26 62 31 62 36 58"
      >
        <animate
          attributeName="d"
          dur="7.8s"
          repeatCount="indefinite"
          values="
            M21 60C26 62 31 62 36 58;
            M19 58C25 61 31 60 38 55;
            M23 63C28 65 33 64 37 60;
            M21 59C27 61 31 61 36 56;
            M21 60C26 62 31 62 36 58
          "
        />
      </path>
      <path
        className="brand-a-ribbon brand-a-ribbon-side"
        style={{ stroke: `url(#${sideId})` }}
        d="M56 58C61 62 66 62 71 60"
      >
        <animate
          attributeName="d"
          dur="7.8s"
          repeatCount="indefinite"
          values="
            M56 58C61 62 66 62 71 60;
            M54 55C61 60 67 61 73 58;
            M55 60C60 64 66 65 71 63;
            M56 56C61 61 66 61 72 59;
            M56 58C61 62 66 62 71 60
          "
        />
      </path>
      <circle className="brand-a-node brand-a-node-apex" cx="46" cy="18" r="3.5">
        <animate attributeName="cy" dur="7.8s" repeatCount="indefinite" values="18;22;16;25;18" />
      </circle>
      <circle className="brand-a-node brand-a-node-soft" cx="20" cy="72" r="3">
        <animate attributeName="cx" dur="7.8s" repeatCount="indefinite" values="20;18;22;19;20" />
        <animate attributeName="cy" dur="7.8s" repeatCount="indefinite" values="72;70;74;71;72" />
      </circle>
      <circle className="brand-a-node brand-a-node-accent" cx="72" cy="72" r="3">
        <animate attributeName="cx" dur="7.8s" repeatCount="indefinite" values="72;74;70;73;72" />
        <animate attributeName="cy" dur="7.8s" repeatCount="indefinite" values="72;70;74;71;72" />
      </circle>
      <circle className="brand-a-node brand-a-node-soft" cx="28" cy="50" r="2.3">
        <animate attributeName="cx" dur="7.8s" repeatCount="indefinite" values="28;26;30;27;28" />
        <animate attributeName="cy" dur="7.8s" repeatCount="indefinite" values="50;52;46;49;50" />
      </circle>
      <circle className="brand-a-node brand-a-node-accent" cx="64" cy="50" r="2.3">
        <animate attributeName="cx" dur="7.8s" repeatCount="indefinite" values="64;66;62;65;64" />
        <animate attributeName="cy" dur="7.8s" repeatCount="indefinite" values="50;52;46;49;50" />
      </circle>
    </g>
  </svg>;
}

function MoleculeAtmosphere({ compact = false }: { compact?: boolean }) {
  const prefix = React.useId().replace(/:/g, "");
  const gradientId = (name: string) => `${name}-${prefix}`;

  return <div className={`workspace-atmosphere ${compact ? "header-atmosphere" : ""}`} aria-hidden="true">
    <svg className="molecule-waveband band-back" viewBox="0 0 1800 180" role="presentation">
      <defs>
        <radialGradient id={gradientId("sphere-sage-back")} cx="34%" cy="28%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#edf4f0" />
          <stop offset="72%" stopColor="#b8cabe" />
          <stop offset="100%" stopColor="#91aa9e" />
        </radialGradient>
        <radialGradient id={gradientId("sphere-blue-back")} cx="34%" cy="28%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#eef4f7" />
          <stop offset="72%" stopColor="#b8c8d4" />
          <stop offset="100%" stopColor="#92a9ba" />
        </radialGradient>
        <radialGradient id={gradientId("sphere-lilac-back")} cx="34%" cy="28%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#f2eff6" />
          <stop offset="72%" stopColor="#c7bfd0" />
          <stop offset="100%" stopColor="#a9a1b6" />
        </radialGradient>
      </defs>
      <path className="waveband-link" d="M-120 104C12 84 128 44 244 44C374 44 470 118 594 118C720 118 826 44 952 44C1076 44 1184 114 1300 114C1426 114 1538 52 1662 52C1732 52 1800 78 1888 100" />
      <path className="waveband-link soft" d="M120 42C148 18 180 8 220 8C266 8 302 24 334 58" />
      <path className="waveband-link soft" d="M818 44C850 18 884 6 924 6C970 6 1008 24 1040 58" />
      <path className="waveband-link soft" d="M1516 52C1548 24 1582 12 1624 12C1668 12 1702 28 1738 60" />
      <circle className="waveband-sphere large" style={{ fill: `url(#${gradientId("sphere-sage-back")})` }} cx="52" cy="104" r="18" />
      <circle className="waveband-sphere large" style={{ fill: `url(#${gradientId("sphere-lilac-back")})` }} cx="244" cy="44" r="20" />
      <circle className="waveband-sphere large" style={{ fill: `url(#${gradientId("sphere-blue-back")})` }} cx="594" cy="118" r="21" />
      <circle className="waveband-sphere large" style={{ fill: `url(#${gradientId("sphere-sage-back")})` }} cx="952" cy="44" r="22" />
      <circle className="waveband-sphere large" style={{ fill: `url(#${gradientId("sphere-lilac-back")})` }} cx="1300" cy="114" r="20" />
      <circle className="waveband-sphere large" style={{ fill: `url(#${gradientId("sphere-blue-back")})` }} cx="1662" cy="52" r="21" />
      <circle className="waveband-sphere small" style={{ fill: `url(#${gradientId("sphere-blue-back")})` }} cx="334" cy="58" r="10" />
      <circle className="waveband-sphere small" style={{ fill: `url(#${gradientId("sphere-sage-back")})` }} cx="1040" cy="58" r="10" />
      <circle className="waveband-sphere small" style={{ fill: `url(#${gradientId("sphere-lilac-back")})` }} cx="1738" cy="60" r="10" />
    </svg>
    <svg className="molecule-waveband band-mid" viewBox="0 0 1800 180" role="presentation">
      <defs>
        <radialGradient id={gradientId("sphere-peach-mid")} cx="34%" cy="28%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#f7f2e9" />
          <stop offset="72%" stopColor="#d3c5ac" />
          <stop offset="100%" stopColor="#b3a187" />
        </radialGradient>
        <radialGradient id={gradientId("sphere-blue-mid")} cx="34%" cy="28%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#edf3f6" />
          <stop offset="72%" stopColor="#bdcad3" />
          <stop offset="100%" stopColor="#9bafbb" />
        </radialGradient>
        <radialGradient id={gradientId("sphere-rose-mid")} cx="34%" cy="28%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#f4eff2" />
          <stop offset="72%" stopColor="#cdbec7" />
          <stop offset="100%" stopColor="#aa9ca8" />
        </radialGradient>
      </defs>
      <path className="waveband-link midline" d="M-180 128C-30 128 104 72 232 72C360 72 456 142 584 142C712 142 812 72 936 72C1060 72 1168 140 1294 140C1426 140 1534 84 1654 84C1754 84 1834 106 1940 128" />
      <path className="waveband-link soft" d="M232 72C262 42 294 28 336 28C380 28 414 42 452 76" />
      <path className="waveband-link soft" d="M936 72C968 42 1002 28 1044 28C1088 28 1124 44 1160 80" />
      <circle className="waveband-sphere large" style={{ fill: `url(#${gradientId("sphere-peach-mid")})` }} cx="54" cy="128" r="19" />
      <circle className="waveband-sphere large" style={{ fill: `url(#${gradientId("sphere-blue-mid")})` }} cx="232" cy="72" r="21" />
      <circle className="waveband-sphere large" style={{ fill: `url(#${gradientId("sphere-rose-mid")})` }} cx="584" cy="142" r="22" />
      <circle className="waveband-sphere large" style={{ fill: `url(#${gradientId("sphere-peach-mid")})` }} cx="936" cy="72" r="20" />
      <circle className="waveband-sphere large" style={{ fill: `url(#${gradientId("sphere-blue-mid")})` }} cx="1294" cy="140" r="21" />
      <circle className="waveband-sphere large" style={{ fill: `url(#${gradientId("sphere-rose-mid")})` }} cx="1654" cy="84" r="20" />
      <circle className="waveband-sphere small" style={{ fill: `url(#${gradientId("sphere-rose-mid")})` }} cx="452" cy="76" r="10" />
      <circle className="waveband-sphere small" style={{ fill: `url(#${gradientId("sphere-peach-mid")})` }} cx="1160" cy="80" r="10" />
    </svg>
    <svg className="molecule-waveband band-front" viewBox="0 0 1800 180" role="presentation">
      <defs>
        <radialGradient id={gradientId("sphere-gold-front")} cx="34%" cy="28%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#f8f4e8" />
          <stop offset="72%" stopColor="#d2c6a8" />
          <stop offset="100%" stopColor="#ad9f80" />
        </radialGradient>
        <radialGradient id={gradientId("sphere-lilac-front")} cx="34%" cy="28%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#f1eef6" />
          <stop offset="72%" stopColor="#c5bfd1" />
          <stop offset="100%" stopColor="#a7a0b7" />
        </radialGradient>
        <radialGradient id={gradientId("sphere-mist-front")} cx="34%" cy="28%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#eef3f3" />
          <stop offset="72%" stopColor="#becbcc" />
          <stop offset="100%" stopColor="#9eafb1" />
        </radialGradient>
      </defs>
      <path className="waveband-link crisp" d="M-160 96C-36 96 72 144 188 144C308 144 404 78 524 78C644 78 740 142 862 142C984 142 1088 86 1202 86C1320 86 1412 132 1530 132C1648 132 1746 96 1880 96" />
      <circle className="waveband-sphere medium" style={{ fill: `url(#${gradientId("sphere-gold-front")})` }} cx="16" cy="96" r="15" />
      <circle className="waveband-sphere medium" style={{ fill: `url(#${gradientId("sphere-lilac-front")})` }} cx="188" cy="144" r="16" />
      <circle className="waveband-sphere medium" style={{ fill: `url(#${gradientId("sphere-mist-front")})` }} cx="524" cy="78" r="16" />
      <circle className="waveband-sphere medium" style={{ fill: `url(#${gradientId("sphere-gold-front")})` }} cx="862" cy="142" r="15" />
      <circle className="waveband-sphere medium" style={{ fill: `url(#${gradientId("sphere-lilac-front")})` }} cx="1202" cy="86" r="16" />
      <circle className="waveband-sphere medium" style={{ fill: `url(#${gradientId("sphere-mist-front")})` }} cx="1530" cy="132" r="15" />
    </svg>
    <div className="molecule-haze haze-a" />
    <div className="molecule-haze haze-b" />
  </div>;
}

function App() {
  const [workspace, setWorkspace] = React.useState<WorkspacePayload>({ path: null, files: [] });
  const [folderPath, setFolderPath] = React.useState(DEFAULT_FOLDER);
  const [activeDoc, setActiveDoc] = React.useState<LoadedDoc | null>(null);
  const [state, setState] = React.useState<AnnotationState>(emptyState());
  const stateRef = React.useRef(state);
  const setLiveState = React.useCallback((next: AnnotationState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  const [activeTab, setActiveTab] = React.useState<EntityType>("substances");
  const [activeRecord, setActiveRecord] = React.useState<ActiveRecord>(null);
  const [editingRecord, setEditingRecord] = React.useState<ActiveRecord>(null);
  const [selectionMenu, setSelectionMenu] = React.useState<SelectionMenu>(null);
  const [spanFocus, setSpanFocus] = React.useState<SpanFocus>(null);
  const [documentSelectedRecord, setDocumentSelectedRecord] = React.useState<ActiveRecord>(null);
  const [fileFilter, setFileFilter] = React.useState("");
  const [nodeSearch, setNodeSearch] = React.useState("");
  const [nodeRelationshipFilters, setNodeRelationshipFilters] = React.useState<NodeRelationshipFilterState>({});
  const [saveState, setSaveState] = React.useState<SaveState>("Saved");
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [linkSource, setLinkSource] = React.useState<GraphRef | null>(null);
  const [graphOpen, setGraphOpen] = React.useState(false);
  const [graphViewport, setGraphViewport] = React.useState<GraphViewport | null>(null);
  const [graphFilters, setGraphFilters] = React.useState<GraphFilterState>({ substances: true, compositions: true, properties: true, measurements: true });
  const [spanInspector, setSpanInspector] = React.useState<SpanInspector>(null);
  const [spanAdjustment, setSpanAdjustment] = React.useState<SpanAdjustment>(null);
  const [spanAdditionTarget, setSpanAdditionTarget] = React.useState<ActiveRecord>(null);
  const leftWidthRef = React.useRef(DEFAULT_SOURCE_PANEL_WIDTH);
  const workbenchShellRef = React.useRef<HTMLDivElement | null>(null);
  const documentViewRef = React.useRef<HTMLElement | null>(null);
  const undoStackRef = React.useRef<UndoSnapshot[]>([]);
  const editSessionRef = React.useRef<UndoSnapshot | null>(null);
  const sourceIdEditRef = React.useRef<UndoSnapshot | null>(null);
  const pendingFieldCommitsRef = React.useRef(new Map<string, PendingFieldCommit>());
  const saveStateRef = React.useRef<SaveState>("Saved");

  const updateSaveState = React.useCallback((next: SaveState) => {
    if (saveStateRef.current === next) return;
    saveStateRef.current = next;
    setSaveState(next);
  }, []);

  const registerPendingFieldCommit = React.useCallback((id: string, commit: PendingFieldCommit | null) => {
    if (commit) pendingFieldCommitsRef.current.set(id, commit);
    else pendingFieldCommitsRef.current.delete(id);
  }, []);

  const flushPendingFieldCommits = React.useCallback(() => {
    const commits = [...pendingFieldCommitsRef.current.values()];
    pendingFieldCommitsRef.current.clear();
    commits.forEach((commit) => commit());
  }, []);
  const pendingFieldCommitContext = React.useMemo<PendingFieldCommitRegistry>(() => ({
    register: registerPendingFieldCommit,
    markDirty: () => updateSaveState("Unsaved changes")
  }), [registerPendingFieldCommit, updateSaveState]);

  React.useEffect(() => { loadWorkspace(); }, []);
  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (saveState !== "Unsaved changes") return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" || !documentSelectedRecord || selectionMenu || spanInspector || isEditableTarget(event.target)) return;
      event.preventDefault();
      deleteSelectedDocumentAnnotation();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [documentSelectedRecord, selectionMenu, spanFocus, spanInspector, state]);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !editingRecord || selectionMenu || spanInspector || event.isComposing || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      finalizeRecord(editingRecord.type, editingRecord.nodeNo);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingRecord, selectionMenu, spanInspector, state]);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !spanInspector || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setSpanInspector(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [spanInspector]);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !selectionMenu || event.isComposing) return;
      event.preventDefault();
      setSelectionMenu(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectionMenu]);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !spanAdjustment || event.isComposing) return;
      event.preventDefault();
      setSpanAdjustment(null);
      setSpanFocus(null);
      setNotice("");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [spanAdjustment]);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !spanAdditionTarget || event.isComposing) return;
      event.preventDefault();
      setSpanAdditionTarget(null);
      setSpanFocus(null);
      setNotice("");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [spanAdditionTarget]);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectionMenu || event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      const type = key === "s" ? "substances"
        : key === "c" ? "compositions"
        : key === "p" ? "properties"
        : key === "m" ? "measurements"
        : null;
      if (!type) return;
      event.preventDefault();
      createFromSelection(type);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectionMenu, state]);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !activeRecord || selectionMenu || spanInspector || spanAdjustment || spanAdditionTarget || event.isComposing) return;
      event.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      if (editingRecord && editingRecord.type === activeRecord.type && editingRecord.nodeNo === activeRecord.nodeNo) finalizeRecord(activeRecord.type, activeRecord.nodeNo);
      else collapseRecord();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeRecord, editingRecord, selectionMenu, spanInspector, spanAdjustment, spanAdditionTarget, state]);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !graphOpen || selectionMenu || spanInspector || spanAdjustment || spanAdditionTarget) return;
      event.preventDefault();
      setGraphOpen(false);
      setLinkSource(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [graphOpen, selectionMenu, spanInspector, spanAdjustment, spanAdditionTarget]);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key !== "ArrowUp" && event.key !== "ArrowDown") || editingRecord || selectionMenu || spanInspector || graphOpen || event.isComposing || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return;
      const tabRecords = state[activeTab] as AnyRecord[];
      if (!activeRecord) {
        if (event.key !== "ArrowDown" || !tabRecords.length) return;
        event.preventDefault();
        selectRecord(activeTab, tabRecords[0].node_no);
        return;
      }
      const records = state[activeRecord.type] as AnyRecord[];
      const currentIndex = records.findIndex((item) => item.node_no === activeRecord.nodeNo);
      if (currentIndex < 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextRecord = records[currentIndex + delta];
      if (!nextRecord) return;
      event.preventDefault();
      selectRecord(activeRecord.type, nextRecord.node_no);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeRecord, activeTab, editingRecord, selectionMenu, spanInspector, graphOpen, state]);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key !== "ArrowLeft" && event.key !== "ArrowRight") || editingRecord || selectionMenu || spanInspector || graphOpen || event.isComposing || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return;
      const currentIndex = entityOrder.indexOf(activeTab);
      if (currentIndex < 0) return;
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const nextTab = entityOrder[currentIndex + delta];
      if (!nextTab) return;
      event.preventDefault();
      setActiveTab(nextTab);
      setActiveRecord(null);
      setEditingRecord(null);
      setDocumentSelectedRecord(null);
      setSpanFocus(null);
      setSpanInspector(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, editingRecord, selectionMenu, spanInspector, graphOpen]);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "e" || (!event.ctrlKey && !event.metaKey) || event.repeat || !activeRecord || editingRecord || selectionMenu || spanInspector || graphOpen || event.isComposing || event.shiftKey || event.altKey || isEditableTarget(event.target)) return;
      event.preventDefault();
      beginEditing(activeRecord.type, activeRecord.nodeNo);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeRecord, editingRecord, selectionMenu, spanInspector, graphOpen]);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "s" || (!event.ctrlKey && !event.metaKey) || event.repeat || !activeDoc) return;
      event.preventDefault();
      void save();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDoc, state]);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "g" || (!event.ctrlKey && !event.metaKey) || event.repeat || !activeDoc) return;
      event.preventDefault();
      setGraphOpen(true);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDoc]);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "z" || (!event.ctrlKey && !event.metaKey) || event.repeat || event.isComposing || event.shiftKey || event.altKey || !activeDoc) return;
      const sourceIdBaseline = sourceIdEditRef.current;
      const editBaseline = editSessionRef.current;
      const sourceIdDirty = Boolean(sourceIdBaseline && !statesEqual(sourceIdBaseline.state, state));
      const editDirty = Boolean(editBaseline && !statesEqual(editBaseline.state, state));
      const undoStack = undoStackRef.current;
      if (!sourceIdDirty && !editDirty && !undoStack.length) return;
      event.preventDefault();
      if (spanAdjustment) {
        setSpanAdjustment(null);
        setNotice("");
      }
      if (sourceIdDirty && sourceIdBaseline) {
        restoreUndoSnapshot(sourceIdBaseline);
        sourceIdEditRef.current = null;
        return;
      }
      if (editDirty && editBaseline) {
        restoreUndoSnapshot(editBaseline);
        editSessionRef.current = editBaseline.editingRecord ? editBaseline : null;
        return;
      }
      const snapshot = undoStack.pop();
      if (!snapshot) return;
      restoreUndoSnapshot(snapshot);
      editSessionRef.current = snapshot.editingRecord ? snapshot : null;
      sourceIdEditRef.current = null;
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDoc, state, spanAdjustment]);

  async function loadWorkspace() {
    try {
      const payload = await apiRequest<WorkspacePayload>("/api/workspace");
      setWorkspace(payload);
      if (payload.path) setFolderPath(payload.path);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function openWorkspace(path = folderPath) {
    setError("");
    setNotice("");
    try {
      const payload = await apiRequest<WorkspacePayload>("/api/workspace/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path })
      });
      setWorkspace(payload);
      setFolderPath(payload.path || path);
      setNodeSearch("");
      closeDocument(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function pickWorkspaceFolder() {
    setError("");
    setNotice("");
    try {
      const payload = await apiRequest<WorkspacePayload>("/api/workspace/pick-folder", { method: "POST" });
      setWorkspace(payload);
      if (payload.path) setFolderPath(payload.path);
      setNodeSearch("");
      closeDocument(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function refreshFiles() {
    if (!workspace.path) return;
    try {
      setWorkspace({ ...workspace, files: await apiRequest<FileSummary[]>("/api/workspace/files") });
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function loadDoc(document_id: string) {
    if (!canLeaveCurrent()) return;
    setError("");
    try {
      const payload = await apiRequest<LoadedDoc>(`/api/workspace/files/${encodeURIComponent(document_id)}`);
      const normalized = normalizeNodeNumbers(payload.state);
      setActiveDoc({ ...payload, state: normalized.state });
      setLiveState(normalized.state);
      setActiveTab("substances");
      setActiveRecord(null);
      setEditingRecord(null);
      setDocumentSelectedRecord(null);
      setNodeSearch("");
      setSelectionMenu(null);
      setSpanFocus(null);
      setLinkSource(null);
      setGraphOpen(false);
      setSpanInspector(null);
      setSpanAdditionTarget(null);
      updateSaveState(statesEqual(payload.state, normalized.state) ? "Saved" : "Unsaved changes");
      undoStackRef.current = [];
      editSessionRef.current = null;
      sourceIdEditRef.current = null;
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  function canLeaveCurrent() {
    return saveState !== "Unsaved changes" || window.confirm("Discard unsaved changes?");
  }

  async function save(next?: AnnotationState) {
    if (!activeDoc) return false;
    flushPendingFieldCommits();
    const currentState = next || stateRef.current;
    const stateToSave = currentState.status === "Unannotated" ? { ...currentState, status: "Partially complete" as Status } : currentState;
    const normalized = normalizeNodeNumbers(stateToSave).state;
    setError("");
    try {
      const payload = await apiRequest<{ state: AnnotationState; summary: FileSummary; path: string; revision: string }>(`/api/workspace/files/${encodeURIComponent(activeDoc.document_id)}/annotations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Annotation-Revision": activeDoc.revision || "0" },
        body: JSON.stringify(normalized)
      });
      setLiveState(payload.state);
      setActiveDoc({ ...activeDoc, state: payload.state, annotation_path: payload.path, revision: payload.revision });
      setWorkspace((current) => ({ ...current, files: current.files.map((file) => file.document_id === activeDoc.document_id ? payload.summary : file) }));
      updateSaveState("Saved");
      sourceIdEditRef.current = null;
      setNotice(`Saved: ${payload.path}`);
      window.setTimeout(() => setNotice(""), 4000);
      return true;
    } catch (requestError) {
      setError(errorMessage(requestError));
      updateSaveState("Unsaved changes");
      return false;
    }
  }

  async function exportCurrent() {
    if (!activeDoc || !await save()) return;
    try {
      const payload = await apiRequest<{ path: string; schema: unknown }>(`/api/workspace/files/${encodeURIComponent(activeDoc.document_id)}/export`, { method: "POST" });
      const filename = fileNameFromPath(payload.path) || `${safeFilename(activeDoc.patent_id || activeDoc.document_id)}.schema.json`;
      downloadTextFile(filename, JSON.stringify(payload.schema, null, 2), "application/json;charset=utf-8");
      setNotice(`Exported and downloaded: ${filename}`);
      window.setTimeout(() => setNotice(""), 5000);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  function exportAnnotatedDocumentView() {
    if (!activeDoc) return;
    flushPendingFieldCommits();
    const documentElement = documentViewRef.current;
    if (!documentElement) {
      setError("Could not find the rendered document view to export.");
      return;
    }
    const exported = documentElement.cloneNode(true) as HTMLElement;
    const currentState = stateRef.current;
    prepareAnnotatedExportClone(exported, currentState);
    const title = currentState.meta.source_id || activeDoc.patent_id || activeDoc.document_id;
    const html = annotatedViewHtml({
      title,
      documentId: activeDoc.document_id,
      workspacePath: workspace.path || "",
      status: currentState.status,
      counts: {
        substances: currentState.substances.length,
        compositions: currentState.compositions.length,
        properties: currentState.properties.length,
        measurements: currentState.measurements.length
      },
      body: exported.innerHTML
    });
    const filename = `${safeFilename(title || activeDoc.document_id)}_annotated_view.html`;
    downloadTextFile(filename, html, "text/html;charset=utf-8");
    setNotice(`Exported annotated view: ${filename}`);
    window.setTimeout(() => setNotice(""), 3200);
  }

  function closeDocument(force = false) {
    if (!force && !canLeaveCurrent()) return;
    setActiveDoc(null);
    setLiveState(emptyState());
    setActiveRecord(null);
    setEditingRecord(null);
    setDocumentSelectedRecord(null);
    setNodeSearch("");
    setSelectionMenu(null);
    setSpanFocus(null);
    setLinkSource(null);
    setGraphOpen(false);
    setSpanInspector(null);
    setSpanAdditionTarget(null);
    updateSaveState("Saved");
    undoStackRef.current = [];
    editSessionRef.current = null;
    sourceIdEditRef.current = null;
  }

  function currentSaveState(next: AnnotationState) {
    return activeDoc && statesEqual(activeDoc.state, next) ? "Saved" : "Unsaved changes";
  }

  function makeUndoSnapshot(nextState = state, overrides: Partial<UndoSnapshot> = {}): UndoSnapshot {
    return {
      state: nextState,
      activeTab,
      activeRecord,
      editingRecord,
      documentSelectedRecord,
      spanFocus,
      ...overrides
    };
  }

  function pushUndoSnapshot(snapshot: UndoSnapshot, nextState?: AnnotationState) {
    const comparisonState = nextState || state;
    if (statesEqual(snapshot.state, comparisonState)) return;
    const stack = undoStackRef.current;
    const last = stack[stack.length - 1];
    if (last && statesEqual(last.state, snapshot.state) && last.activeTab === snapshot.activeTab) return;
    undoStackRef.current = [...stack.slice(-79), snapshot];
  }

  function restoreUndoSnapshot(snapshot: UndoSnapshot) {
    setLiveState(snapshot.state);
    setActiveTab(snapshot.activeTab);
    setActiveRecord(snapshot.activeRecord);
    setEditingRecord(snapshot.editingRecord);
    setDocumentSelectedRecord(snapshot.documentSelectedRecord);
    setSpanFocus(snapshot.spanFocus);
    setSelectionMenu(null);
    setSpanInspector(null);
    setSpanAdjustment(null);
    setSpanAdditionTarget(null);
    setLinkSource(null);
    updateSaveState(currentSaveState(snapshot.state));
  }

  function markDirty(next: AnnotationState, options?: { recordHistory?: boolean; historySnapshot?: UndoSnapshot }) {
    const normalized = normalizeNodeNumbers(next);
    if (options?.recordHistory) pushUndoSnapshot(options.historySnapshot || makeUndoSnapshot(), normalized.state);
    setLiveState(normalized.state);
    setActiveRecord((current) => remapActiveRecord(current, normalized.maps));
    setEditingRecord((current) => remapActiveRecord(current, normalized.maps));
    setDocumentSelectedRecord((current) => remapActiveRecord(current, normalized.maps));
    setSpanAdditionTarget((current) => remapActiveRecord(current, normalized.maps));
    setLinkSource((current) => remapGraphRef(current, normalized.maps));
    setSpanFocus((current) => remapSpanFocus(current, normalized.maps));
    setSpanInspector(null);
    updateSaveState(currentSaveState(normalized.state));
    return normalized;
  }

  function updateStatus(status: Status) {
    const next = { ...state, status };
    markDirty(next, { recordHistory: true });
  }

  function updateMeta(patch: Partial<Meta>, options?: { recordHistory?: boolean }) {
    markDirty({ ...state, meta: { ...state.meta, ...patch } }, options);
  }

  function beginSourceIdEdit() {
    sourceIdEditRef.current = makeUndoSnapshot();
  }

  function commitSourceIdEdit() {
    const baseline = sourceIdEditRef.current;
    if (baseline && !statesEqual(baseline.state, state)) pushUndoSnapshot(baseline, state);
    sourceIdEditRef.current = null;
  }

  function startPanelResize(event: React.MouseEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    const shell = workbenchShellRef.current;
    if (!shell) return;
    const startX = event.clientX;
    const startWidth = leftWidthRef.current;
    const shellWidth = Math.max(1, shell.getBoundingClientRect().width);
    const minWidth = MIN_SOURCE_PANEL_WIDTH_PX / shellWidth * 100;
    const maxWidth = (shellWidth - MIN_ANNOTATION_PANEL_WIDTH_PX - PANEL_RESIZE_HANDLE_WIDTH_PX) / shellWidth * 100;
    const clampWidth = (value: number) => Math.min(Math.max(value, minWidth), Math.max(minWidth, maxWidth));
    let nextWidth = clampWidth(startWidth);
    let frame = 0;
    const applyWidth = () => {
      frame = 0;
      shell.style.setProperty("--source-width", `${nextWidth}%`);
    };
    const move = (moveEvent: MouseEvent) => {
      const delta = (moveEvent.clientX - startX) / shellWidth * 100;
      nextWidth = clampWidth(startWidth + delta);
      if (!frame) frame = window.requestAnimationFrame(applyWidth);
    };
    const finish = () => {
      if (frame) window.cancelAnimationFrame(frame);
      shell.style.setProperty("--source-width", `${nextWidth}%`);
      leftWidthRef.current = nextWidth;
      document.body.classList.remove("panel-resizing");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", finish);
      window.removeEventListener("blur", finish);
    };
    document.body.classList.add("panel-resizing");
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", finish);
    window.addEventListener("blur", finish);
  }

  function handleDocumentSelection(event: React.MouseEvent) {
    if (!activeDoc) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const container = event.currentTarget;
    const startElement = selectionNodeElement(range.startContainer);
    const endElement = selectionNodeElement(range.endContainer);
    if (!startElement || !endElement || !container.contains(startElement) || !container.contains(endElement)) return;
    const selectedText = selection.toString().trim();
    if (!selectedText) return;
    const match = selectionOffsets(activeDoc.markdown, range, selectedText);
    if (match && spanAdjustment) {
      const active = { type: spanAdjustment.type, nodeNo: spanAdjustment.nodeNo } as NonNullable<ActiveRecord>;
      const record = getRecord(state, active);
      const target = record ? annotationTargetForField(spanAdjustment.type, record, spanAdjustment.field, state) : null;
      if (record && target) {
        const { field, patch } = buildAnnotationPatch(record, target, match.text);
        const adjustedSpan = makeEvidence({ id: `adj-${Date.now()}`, text: match.text, start: match.start, end: match.end }, field, Boolean(record.evidence_spans[spanAdjustment.index]?.primary));
        const nextEvidence = sortEvidenceSpans(record.evidence_spans.map((span, index) => index === spanAdjustment.index ? adjustedSpan : span));
        updateRecord(spanAdjustment.type, spanAdjustment.nodeNo, {
          ...patch,
          evidence_spans: nextEvidence,
          evidence_text: summarizeEvidenceText(nextEvidence)
        });
        setSpanFocus({ type: spanAdjustment.type, nodeNo: spanAdjustment.nodeNo, index: evidenceSpanIndex(nextEvidence, adjustedSpan) });
        setNotice(`Adjusted ${target.label}`);
        window.setTimeout(() => setNotice(""), 2600);
      }
      setSpanAdjustment(null);
      setSelectionMenu(null);
      setDocumentSelectedRecord(null);
      setSpanInspector(null);
      selection.removeAllRanges();
      return;
    }
    if (match && spanAdditionTarget) {
      appendEvidenceSpan(spanAdditionTarget.type, spanAdditionTarget.nodeNo, { id: `add-${Date.now()}`, ...match });
      setSpanAdditionTarget(null);
      setSelectionMenu(null);
      setDocumentSelectedRecord(null);
      setSpanInspector(null);
      selection.removeAllRanges();
      return;
    }
    if (match) {
      setSelectionMenu({ id: `sel-${Date.now()}`, text: match.text, start: match.start, end: match.end });
      setSpanFocus(null);
      setDocumentSelectedRecord(null);
      setSpanInspector(null);
    }
    selection.removeAllRanges();
  }

  function nextNodeNo(current = state) {
    return Math.max(0, ...nodeRecords(current).map((item) => item.node_no)) + 1;
  }

  function createFromSelection(type: EntityType) {
    if (!selectionMenu) return;
    const node_no = nextNodeNo();
    const span = makeEvidence(selectionMenu, type === "measurements" ? "evidence_text" : identityField(type), true);
    const base = { node_no, evidence_text: "-", evidence_spans: [span] };
    const next = { ...state };
    let createdRecord: AnyRecord | null = null;
    if (type === "substances") {
      createdRecord = { ...base, substance_name: selectionMenu.text, substance_type: "raw", physical_form: "-", manufacturer: "-" };
      next.substances = [...state.substances, createdRecord];
    }
    if (type === "compositions") {
      createdRecord = { ...base, composition_name: selectionMenu.text, composition_type: "-", physical_form: "-", constituents: [] };
      next.compositions = [...state.compositions, createdRecord];
    }
    if (type === "properties") {
      createdRecord = { ...base, property_name: selectionMenu.text, property_type: "performance", target_ref: 0 };
      next.properties = [...state.properties, createdRecord];
    }
    if (type === "measurements") {
      createdRecord = normalizeMeasurementRecord({ ...base, measurement_type: "quantitative", property_ref: 0, value: [], comparator: "-", unit: [], lower_value: "-", upper_value: "-", measurement_conditions: [] });
      next.measurements = [...state.measurements, createdRecord];
    }
    const normalized = markDirty(next, { recordHistory: true });
    const normalizedNo = normalized.maps[type].get(node_no) || node_no;
    setActiveTab(type);
    setActiveRecord({ type, nodeNo: normalizedNo });
    setEditingRecord({ type, nodeNo: normalizedNo });
    setDocumentSelectedRecord(null);
    setSpanAdjustment(null);
    setSpanAdditionTarget(null);
    setSelectionMenu(null);
    editSessionRef.current = makeUndoSnapshot(normalized.state, {
      activeTab: type,
      activeRecord: { type, nodeNo: normalizedNo },
      editingRecord: { type, nodeNo: normalizedNo },
      documentSelectedRecord: null,
      spanFocus: null
    });
  }

  function createCompositionWithoutSelection() {
    const node_no = nextNodeNo();
    const createdRecord: CompositionRecord = {
      node_no,
      composition_name: "New composition",
      composition_type: "-",
      physical_form: "-",
      constituents: [],
      evidence_text: "-",
      evidence_spans: []
    };
    const next = { ...state, compositions: [...state.compositions, createdRecord] };
    const normalized = markDirty(next, { recordHistory: true });
    const normalizedNo = normalized.maps.compositions.get(node_no) || node_no;
    setActiveTab("compositions");
    setActiveRecord({ type: "compositions", nodeNo: normalizedNo });
    setEditingRecord({ type: "compositions", nodeNo: normalizedNo });
    setDocumentSelectedRecord(null);
    setSpanAdjustment(null);
    setSpanAdditionTarget(null);
    setSelectionMenu(null);
    setSpanInspector(null);
    editSessionRef.current = makeUndoSnapshot(normalized.state, {
      activeTab: "compositions",
      activeRecord: { type: "compositions", nodeNo: normalizedNo },
      editingRecord: { type: "compositions", nodeNo: normalizedNo },
      documentSelectedRecord: null,
      spanFocus: null
    });
    setNotice("Created composition node");
    window.setTimeout(() => setNotice(""), 2200);
  }

  function beginSpanAdjustment(type: EntityType, nodeNo: number, field: string, index: number) {
    if (spanAdjustment && spanAdjustment.type === type && spanAdjustment.nodeNo === nodeNo && spanAdjustment.field === field && spanAdjustment.index === index) {
      setSpanAdjustment(null);
      setSpanFocus(null);
      setNotice("");
      return;
    }
    setActiveTab(type);
    setActiveRecord({ type, nodeNo });
    setEditingRecord({ type, nodeNo });
    setSelectionMenu(null);
    setDocumentSelectedRecord(null);
    setSpanInspector(null);
    setSpanFocus({ type, nodeNo, index });
    setSpanAdditionTarget(null);
    setSpanAdjustment({ type, nodeNo, field, index });
    setNotice(`Adjusting ${fieldDisplayName(field)}. Select the corrected text span, then release. Press Esc to cancel.`);
  }

  function selectRecord(type: EntityType, nodeNo: number, focusIndex = 0, origin: "panel" | "document" = "panel") {
    flushPendingFieldCommits();
    const currentState = stateRef.current;
    if (editSessionRef.current && editingRecord && !statesEqual(editSessionRef.current.state, currentState)) {
      pushUndoSnapshot(editSessionRef.current, currentState);
    }
    editSessionRef.current = null;
    setActiveTab(type);
    setActiveRecord({ type, nodeNo });
    setEditingRecord(null);
    setDocumentSelectedRecord(origin === "document" ? { type, nodeNo } : null);
    setSpanAdjustment(null);
    setSpanAdditionTarget(null);
    setSpanInspector(null);
    window.setTimeout(() => document.querySelector(recordSelector(type, nodeNo))?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
    const record = (currentState[type] as AnyRecord[]).find((item) => item.node_no === nodeNo);
    const span = record?.evidence_spans[focusIndex];
    if (span && typeof span.start === "number") {
      setSpanFocus({ type, nodeNo, index: focusIndex });
      if (origin === "document") {
        window.setTimeout(() => document.querySelector(highlightSelector(type, nodeNo, focusIndex))?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
      }
    }
  }

  function selectRecordFromGraph(type: EntityType, nodeNo: number) {
    flushPendingFieldCommits();
    const currentState = stateRef.current;
    if (editSessionRef.current && editingRecord && !statesEqual(editSessionRef.current.state, currentState)) {
      pushUndoSnapshot(editSessionRef.current, currentState);
    }
    editSessionRef.current = null;
    setActiveTab(type);
    setActiveRecord({ type, nodeNo });
    setEditingRecord(null);
    setDocumentSelectedRecord(null);
    setSpanAdjustment(null);
    setSpanAdditionTarget(null);
    setSpanInspector(null);
    setSpanFocus(null);
    window.setTimeout(() => document.querySelector(recordSelector(type, nodeNo))?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
  }

  function updateRecord(type: EntityType, nodeNo: number, patch: RecordPatch) {
    const currentState = stateRef.current;
    markDirty({
      ...currentState,
      [type]: (currentState[type] as AnyRecord[]).map((item) => {
        if (item.node_no !== nodeNo) return item;
        const resolvedPatch = typeof patch === "function" ? patch(item) : patch;
        return type === "measurements"
          ? editingRecord?.type === type && editingRecord.nodeNo === nodeNo
            ? { ...(item as MeasurementRecord), ...resolvedPatch }
            : normalizeMeasurementRecord({ ...(item as MeasurementRecord), ...resolvedPatch })
          : { ...item, ...resolvedPatch };
      })
    });
  }

  function beginEditing(type: EntityType, nodeNo: number) {
    flushPendingFieldCommits();
    setActiveTab(type);
    setActiveRecord({ type, nodeNo });
    setEditingRecord({ type, nodeNo });
    setDocumentSelectedRecord(null);
    setSpanAdjustment(null);
    setSpanAdditionTarget(null);
    setSpanInspector(null);
    editSessionRef.current = makeUndoSnapshot(state, {
      activeTab: type,
      activeRecord: { type, nodeNo },
      editingRecord: { type, nodeNo },
      documentSelectedRecord: null,
      spanFocus
    });
  }

  function collapseRecord() {
    flushPendingFieldCommits();
    setActiveRecord(null);
    setEditingRecord(null);
    setDocumentSelectedRecord(null);
    setSpanAdjustment(null);
    setSpanAdditionTarget(null);
    setSelectionMenu(null);
    setSpanFocus(null);
    setSpanInspector(null);
  }

  function updateGraphLayout(patch: GraphLayout) {
    markDirty({ ...state, graph_layout: { ...(state.graph_layout || {}), ...patch } }, { recordHistory: true });
  }

  function deleteSelectedDocumentAnnotation() {
    if (!documentSelectedRecord) return;
    const record = getRecord(state, documentSelectedRecord);
    const selectedSpanIndex = spanFocus?.type === documentSelectedRecord.type && spanFocus.nodeNo === documentSelectedRecord.nodeNo ? spanFocus.index : null;
    if (!record || selectedSpanIndex === null || !record.evidence_spans[selectedSpanIndex]) {
      deleteRecord(documentSelectedRecord.type, documentSelectedRecord.nodeNo);
      return;
    }
    if (isMainEvidenceSpan(documentSelectedRecord.type, record, selectedSpanIndex)) {
      deleteRecord(documentSelectedRecord.type, documentSelectedRecord.nodeNo);
      return;
    }
    removeEvidenceSpan(documentSelectedRecord.type, documentSelectedRecord.nodeNo, selectedSpanIndex);
  }

  function removeEvidenceSpan(type: EntityType, nodeNo: number, index: number) {
    const record = getRecord(state, { type, nodeNo });
    if (!record) return;
    if (isMainEvidenceSpan(type, record, index)) {
      deleteRecord(type, nodeNo);
      return;
    }
    const nextEvidence = record.evidence_spans.filter((_, spanIndex) => spanIndex !== index);
    const nextRecord = {
      ...record,
      evidence_spans: nextEvidence,
      evidence_text: summarizeEvidenceText(nextEvidence)
    } as AnyRecord;
    markDirty({
      ...state,
      [type]: (state[type] as AnyRecord[]).map((item) => item.node_no === nodeNo ? nextRecord : item)
    } as AnnotationState, { recordHistory: true });
    setActiveRecord({ type, nodeNo });
    setDocumentSelectedRecord(null);
    setSpanFocus(null);
    setSpanInspector(null);
    setNotice("Removed evidence span");
    window.setTimeout(() => setNotice(""), 2600);
  }

  function deleteRecord(type: EntityType, nodeNo: number) {
    markDirty(removeRecordsFromState(state, [{ type, nodeNo }]), { recordHistory: true });
    setActiveRecord(null);
    setEditingRecord(null);
    setDocumentSelectedRecord(null);
    editSessionRef.current = null;
    setSpanAdjustment(null);
    setSpanAdditionTarget(null);
    setSpanFocus(null);
  }

  function deleteGraphNodes(refs: GraphRef[]) {
    if (!refs.length) return;
    const next = removeRecordsFromState(state, refs);
    if (next === state) return;
    markDirty(next, { recordHistory: true });
    setActiveRecord(null);
    setEditingRecord(null);
    setDocumentSelectedRecord(null);
    editSessionRef.current = null;
    setSpanAdjustment(null);
    setSpanAdditionTarget(null);
    setSpanFocus(null);
    setLinkSource(null);
    setNotice(`Deleted ${refs.length} ${refs.length === 1 ? "node" : "nodes"}`);
    window.setTimeout(() => setNotice(""), 2600);
  }

  function duplicateGraphNodes(refs: GraphRef[], step = 1) {
    if (!refs.length) return;
    const cloned = cloneGraphNodes(state, refs, step);
    if (cloned.state === state) return;
    markDirty(cloned.state, { recordHistory: true });
    setLinkSource(null);
    setNotice(`Pasted ${refs.length} ${refs.length === 1 ? "node" : "nodes"}`);
    window.setTimeout(() => setNotice(""), 2600);
  }

  function annotateActiveItem(target: AnnotationTarget) {
    if (!selectionMenu || !activeRecord) return;
    const record = getRecord(state, activeRecord);
    if (!record) return;
    const { field, patch } = buildAnnotationPatch(record, target, selectionMenu.text);
    const nextEvidence = sortEvidenceSpans([...record.evidence_spans.filter((span) => span.field !== field), makeEvidence(selectionMenu, field, field === identityField(activeRecord.type))]);
    updateRecord(activeRecord.type, activeRecord.nodeNo, {
      ...patch,
      evidence_spans: nextEvidence,
      evidence_text: summarizeEvidenceText(nextEvidence)
    });
    setSpanAdjustment(null);
    setSelectionMenu(null);
    setNotice(`Annotated ${target.label} for ${nodeLabel(state, activeRecord)}`);
    window.setTimeout(() => setNotice(""), 3000);
  }

  function addEvidenceSpan(type: EntityType, nodeNo: number) {
    if (selectionMenu) {
      appendEvidenceSpan(type, nodeNo, selectionMenu);
      setSpanAdditionTarget(null);
      setSelectionMenu(null);
      return;
    }
    setActiveTab(type);
    setActiveRecord({ type, nodeNo });
    setEditingRecord({ type, nodeNo });
    setSpanAdjustment(null);
    setSpanInspector(null);
    setDocumentSelectedRecord(null);
    setSpanFocus(null);
    setSpanAdditionTarget({ type, nodeNo });
    setNotice(`Select source text to add an evidence span to ${nodeLabel(state, { type, nodeNo })}. Press Esc to cancel.`);
  }

  function appendEvidenceSpan(type: EntityType, nodeNo: number, selection: NonNullable<SelectionMenu>) {
    const record = (state[type] as AnyRecord[]).find((item) => item.node_no === nodeNo);
    if (!record) return;
    const duplicate = record.evidence_spans.some((span) => span.field === "evidence_text" && span.start === selection.start && span.end === selection.end);
    if (duplicate) {
      setNotice("That evidence span is already linked to this node.");
      window.setTimeout(() => setNotice(""), 2600);
      return;
    }
    const addedSpan = makeEvidence(selection, "evidence_text");
    const nextEvidence = sortEvidenceSpans([...record.evidence_spans, addedSpan]);
    updateRecord(type, nodeNo, {
      evidence_spans: nextEvidence,
      evidence_text: summarizeEvidenceText(nextEvidence)
    });
    setSpanFocus({ type, nodeNo, index: evidenceSpanIndex(nextEvidence, addedSpan) });
    setDocumentSelectedRecord(null);
    setSpanInspector(null);
    setSpanAdjustment(null);
    setSpanAdditionTarget(null);
    setSelectionMenu(null);
    setNotice(`Added evidence span to ${nodeLabel(state, { type, nodeNo })}`);
    window.setTimeout(() => setNotice(""), 2600);
  }

  function finalizeRecord(type: EntityType, nodeNo: number) {
    flushPendingFieldCommits();
    const currentState = stateRef.current;
    const record = (currentState[type] as AnyRecord[]).find((item) => item.node_no === nodeNo);
    let nextState = currentState;
    if (record) {
      const finalized = finalizeRecordDefaults(type, record);
      if (JSON.stringify(finalized) !== JSON.stringify(record)) {
        nextState = {
          ...currentState,
          [type]: (currentState[type] as AnyRecord[]).map((item) => item.node_no === nodeNo ? finalized as AnyRecord : item)
        } as AnnotationState;
      }
    }
    if (editSessionRef.current && !statesEqual(editSessionRef.current.state, nextState)) {
      markDirty(nextState, { recordHistory: true, historySnapshot: editSessionRef.current });
    } else if (nextState !== currentState) {
      markDirty(nextState);
    }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setActiveRecord({ type, nodeNo });
    setEditingRecord(null);
    setDocumentSelectedRecord(null);
    editSessionRef.current = null;
    setSpanAdjustment(null);
    setSpanAdditionTarget(null);
    setSelectionMenu(null);
    setSpanFocus(null);
    setSpanInspector(null);
  }

  function handleAnnotationSpanClick(event: React.MouseEvent, spans: AnnotatedSpan[], text: string) {
    if (spans.length === 1) {
      selectRecord(spans[0].entityType, spans[0].nodeNo, spans[0].index, "document");
      return;
    }
    setSelectionMenu(null);
    setDocumentSelectedRecord(null);
    setSpanInspector({ x: event.clientX, y: event.clientY, text, spans });
  }

  function removeGraphRelationship(edge: RelationshipEdge) {
    const next = removeRelationship(state, edge);
    if (next === state) return;
    markDirty(next, { recordHistory: true });
    setNotice(`Removed ${edge.label} link`);
    window.setTimeout(() => setNotice(""), 3000);
  }

  function bulkLinkGraphGroup(group: GraphNodeGroup, ref: GraphRef) {
    const result = addBulkRelationships(state, group, ref);
    if (!result.applied) {
      setNotice(result.message);
      window.setTimeout(() => setNotice(""), 4200);
      selectRecord(ref.type, ref.nodeNo);
      return;
    }
    markDirty(result.state, { recordHistory: true });
    setNotice(result.message);
    window.setTimeout(() => setNotice(""), 3200);
    selectRecord(ref.type, ref.nodeNo);
  }

  function onGraphNodeClick(ref: GraphRef) {
    if (!linkSource) {
      setLinkSource(ref);
      selectRecordFromGraph(ref.type, ref.nodeNo);
      return;
    }
    if (linkSource.type === ref.type && linkSource.nodeNo === ref.nodeNo) {
      setLinkSource(null);
      return;
    }
    const next = addRelationship(state, linkSource, ref);
    if (next === state) {
      setNotice("That link type is not supported. Link Substance/Composition -> Composition, Substance/Composition -> Property, or Property -> Measurement.");
      window.setTimeout(() => setNotice(""), 5000);
    } else {
      markDirty(next, { recordHistory: true });
      setNotice(`Linked ${nodeLabel(state, linkSource)} -> ${nodeLabel(state, ref)}`);
      window.setTimeout(() => setNotice(""), 3000);
    }
    setLinkSource(null);
    selectRecordFromGraph(ref.type, ref.nodeNo);
  }

  const filteredFiles = workspace.files.filter((file) => `${file.document_id} ${file.patent_id} ${file.path || ""}`.toLowerCase().includes(fileFilter.toLowerCase()));
  if (!workspace.path || !activeDoc) {
    return <Landing
      workspace={workspace}
      folderPath={folderPath}
      setFolderPath={setFolderPath}
      onOpenWorkspace={openWorkspace}
      onRefresh={refreshFiles}
      files={filteredFiles}
      filter={fileFilter}
      setFilter={setFileFilter}
      onPickWorkspace={pickWorkspaceFolder}
      onOpenFolder={openWorkspace}
      onOpenFile={loadDoc}
      error={error}
    />;
  }

  return <div ref={workbenchShellRef} className="workbench-shell" style={{ "--source-width": `${leftWidthRef.current}%` } as React.CSSProperties}>
    <section className="source-panel">
      <header className="source-header">
        <MoleculeAtmosphere compact />
        <button onClick={() => closeDocument()}><ArrowLeft size={14}/> Folder</button>
        <div><strong>{activeDoc.document_id}</strong><span>{workspace.path}</span></div>
        <button type="button" className="source-export-button" onClick={exportAnnotatedDocumentView}><Download size={14}/> Export view</button>
      </header>
      <article className="document-view" ref={documentViewRef} onMouseUp={handleDocumentSelection}>
        {renderMarkdown(activeDoc.markdown, state, spanFocus, handleAnnotationSpanClick, selectionMenu)}
      </article>
      {selectionMenu && <SelectionPopover selection={selectionMenu} activeRecord={activeRecord} onCreate={createFromSelection} onDismiss={() => setSelectionMenu(null)} />}
      {spanInspector && <OverlapInspector inspector={spanInspector} state={state} onFocus={(span) => selectRecord(span.entityType, span.nodeNo, span.index, "document")} onClose={() => setSpanInspector(null)}/>}
    </section>
    <button className="resize-handle" onMouseDown={startPanelResize} aria-label="Resize source and annotation panes"></button>
    <aside className="annotation-panel">
      <header className="annotation-header">
        <MoleculeAtmosphere compact />
        <div><strong>{state.meta.source_id || activeDoc.patent_id}</strong><span className={`save-state ${saveState === "Saved" ? "saved" : "unsaved"}`}>{saveState}</span></div>
        <select value={state.status === "Unannotated" ? "Partially complete" : state.status} onChange={(event) => updateStatus(event.target.value as Status)}>
          <option>Partially complete</option>
          <option>Completed</option>
        </select>
        <button type="button" onClick={() => save()}><Save size={14}/> Save</button>
        <button type="button" onClick={() => setGraphOpen(true)}><GitBranch size={14}/> Graph</button>
        <button type="button" onClick={exportCurrent}><Download size={14}/> Export</button>
      </header>
      {error && <Message tone="error" text={error} onClose={() => setError("")}/>}
      {notice && <Message tone="success" text={notice} onClose={() => setNotice("")}/>}
      <section className="schema-meta">
        <label>Source type<select value={state.meta.source_type} onChange={(event) => updateMeta({ source_type: event.target.value as SourceType }, { recordHistory: true })}><option>patent</option><option>paper</option></select></label>
        <label>Source ID<input value={state.meta.source_id} onFocus={beginSourceIdEdit} onBlur={commitSourceIdEdit} onChange={(event) => updateMeta({ source_id: event.target.value })}/></label>
      </section>
      <nav className="tabs">
        {(Object.keys(labels) as EntityType[]).map((type) => <button key={type} className={`${type} ${activeTab === type ? "active" : ""}`} onClick={() => { flushPendingFieldCommits(); setActiveTab(type); setActiveRecord(null); setEditingRecord(null); setNodeSearch(""); }}>{labels[type]} <span>{state[type].length}</span></button>)}
      </nav>
      <section className="annotation-workspace">
      <PendingFieldCommitContext.Provider value={pendingFieldCommitContext}>
        <NodeAccordion type={activeTab} state={state} activeRecord={activeRecord} editingRecord={editingRecord} selectionMenu={selectionMenu} spanAdjustment={spanAdjustment} spanAdditionTarget={spanAdditionTarget} search={nodeSearch} relationshipFilters={nodeRelationshipFilters[activeTab] || {}} onSearchChange={setNodeSearch} onRelationshipFilterChange={(key, value) => setNodeRelationshipFilters((current) => ({ ...current, [activeTab]: { ...(current[activeTab] || {}), [key]: value } }))} onSelect={selectRecord} onEdit={(type, nodeNo, editing) => editing ? finalizeRecord(type, nodeNo) : beginEditing(type, nodeNo)} onDelete={deleteRecord} onUpdate={updateRecord} onAnnotateItem={annotateActiveItem} onAddEvidenceSpan={addEvidenceSpan} onDone={finalizeRecord} onCollapse={collapseRecord} onCreateComposition={createCompositionWithoutSelection} onAdjustSpan={beginSpanAdjustment}/>
      </PendingFieldCommitContext.Provider>
      </section>
    </aside>
    {graphOpen && <GraphDrawer state={state} linkSource={linkSource} initialViewport={graphViewport} initialFilters={graphFilters} onViewportChange={setGraphViewport} onFiltersChange={setGraphFilters} onNodeClick={onGraphNodeClick} onBulkLink={bulkLinkGraphGroup} onDuplicateNodes={duplicateGraphNodes} onDeleteNodes={deleteGraphNodes} onLayoutChange={updateGraphLayout} onRemoveRelationship={removeGraphRelationship} onClearSource={() => setLinkSource(null)} onClose={() => setGraphOpen(false)}/>}
  </div>;
}

function Landing({ workspace, folderPath, setFolderPath, onOpenWorkspace, onRefresh, files, filter, setFilter, onPickWorkspace, onOpenFolder, onOpenFile, error }: {
  workspace: WorkspacePayload;
  folderPath: string;
  setFolderPath: (path: string) => void;
  onOpenWorkspace: (path?: string) => void;
  onRefresh: () => void;
  files: FileSummary[];
  filter: string;
  setFilter: (filter: string) => void;
  onPickWorkspace: () => void;
  onOpenFolder: (path: string) => void;
  onOpenFile: (file: string) => void;
  error: string;
}) {
  const folderCount = files.filter((file) => file.kind === "folder").length;
  const rawFileCount = files.length - folderCount;
  const fixedWorkspace = Boolean(workspace.configured_workspace);
  const mouseNavigationAtRef = React.useRef(0);
  const forwardFoldersRef = React.useRef<string[]>([]);
  const openParentFolder = React.useCallback(() => {
    if (!workspace.parent_path || !workspace.path) return;
    const forwardFolders = forwardFoldersRef.current;
    if (forwardFolders[forwardFolders.length - 1] !== workspace.path) {
      forwardFolders.push(workspace.path);
    }
    onOpenWorkspace(workspace.parent_path);
  }, [onOpenWorkspace, workspace.parent_path, workspace.path]);
  const openForwardFolder = React.useCallback(() => {
    const nextFolder = forwardFoldersRef.current.pop();
    if (!nextFolder) return;
    onOpenWorkspace(nextFolder);
  }, [onOpenWorkspace]);
  const openFolderFromList = React.useCallback((path: string) => {
    forwardFoldersRef.current = [];
    onOpenFolder(path);
  }, [onOpenFolder]);

  React.useEffect(() => {
    if (!workspace.parent_path && !forwardFoldersRef.current.length) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" || event.repeat || event.isComposing || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return;
      if (!workspace.parent_path) return;
      event.preventDefault();
      openParentFolder();
    };
    const handleMouseNavigation = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      event.stopPropagation();
      const now = performance.now();
      if (now - mouseNavigationAtRef.current < 250) return;
      mouseNavigationAtRef.current = now;
      if (event.button === 3) openParentFolder();
      if (event.button === 4) openForwardFolder();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handleMouseNavigation, true);
    window.addEventListener("mouseup", handleMouseNavigation, true);
    window.addEventListener("auxclick", handleMouseNavigation, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleMouseNavigation, true);
      window.removeEventListener("mouseup", handleMouseNavigation, true);
      window.removeEventListener("auxclick", handleMouseNavigation, true);
    };
  }, [openForwardFolder, openParentFolder, workspace.parent_path]);

  return <main className="landing-shell">
    <section className={`workspace-bar ${fixedWorkspace ? "fixed-workspace" : ""}`}>
      <div className="workspace-atmosphere" aria-hidden="true">
        <svg className="molecule-waveband band-back" viewBox="0 0 1800 180" role="presentation">
          <defs>
            <radialGradient id="sphere-sage-back" cx="34%" cy="28%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="30%" stopColor="#edf4f0" />
              <stop offset="72%" stopColor="#b8cabe" />
              <stop offset="100%" stopColor="#91aa9e" />
            </radialGradient>
            <radialGradient id="sphere-blue-back" cx="34%" cy="28%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="30%" stopColor="#eef4f7" />
              <stop offset="72%" stopColor="#b8c8d4" />
              <stop offset="100%" stopColor="#92a9ba" />
            </radialGradient>
            <radialGradient id="sphere-lilac-back" cx="34%" cy="28%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="30%" stopColor="#f2eff6" />
              <stop offset="72%" stopColor="#c7bfd0" />
              <stop offset="100%" stopColor="#a9a1b6" />
            </radialGradient>
          </defs>
          <path className="waveband-link" d="M-120 104C12 84 128 44 244 44C374 44 470 118 594 118C720 118 826 44 952 44C1076 44 1184 114 1300 114C1426 114 1538 52 1662 52C1732 52 1800 78 1888 100" />
          <path className="waveband-link soft" d="M120 42C148 18 180 8 220 8C266 8 302 24 334 58" />
          <path className="waveband-link soft" d="M818 44C850 18 884 6 924 6C970 6 1008 24 1040 58" />
          <path className="waveband-link soft" d="M1516 52C1548 24 1582 12 1624 12C1668 12 1702 28 1738 60" />
          <circle className="waveband-sphere large sphere-sage" cx="52" cy="104" r="18" />
          <circle className="waveband-sphere large sphere-lilac" cx="244" cy="44" r="20" />
          <circle className="waveband-sphere large sphere-blue" cx="594" cy="118" r="21" />
          <circle className="waveband-sphere large sphere-sage" cx="952" cy="44" r="22" />
          <circle className="waveband-sphere large sphere-lilac" cx="1300" cy="114" r="20" />
          <circle className="waveband-sphere large sphere-blue" cx="1662" cy="52" r="21" />
          <circle className="waveband-sphere small sphere-blue" cx="334" cy="58" r="10" />
          <circle className="waveband-sphere small sphere-sage" cx="1040" cy="58" r="10" />
          <circle className="waveband-sphere small sphere-lilac" cx="1738" cy="60" r="10" />
        </svg>
        <svg className="molecule-waveband band-mid" viewBox="0 0 1800 180" role="presentation">
          <defs>
            <radialGradient id="sphere-peach-mid" cx="34%" cy="28%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="30%" stopColor="#f7f2e9" />
              <stop offset="72%" stopColor="#d3c5ac" />
              <stop offset="100%" stopColor="#b3a187" />
            </radialGradient>
            <radialGradient id="sphere-blue-mid" cx="34%" cy="28%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="30%" stopColor="#edf3f6" />
              <stop offset="72%" stopColor="#bdcad3" />
              <stop offset="100%" stopColor="#9bafbb" />
            </radialGradient>
            <radialGradient id="sphere-rose-mid" cx="34%" cy="28%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="30%" stopColor="#f4eff2" />
              <stop offset="72%" stopColor="#cdbec7" />
              <stop offset="100%" stopColor="#aa9ca8" />
            </radialGradient>
          </defs>
          <path className="waveband-link midline" d="M-180 128C-30 128 104 72 232 72C360 72 456 142 584 142C712 142 812 72 936 72C1060 72 1168 140 1294 140C1426 140 1534 84 1654 84C1754 84 1834 106 1940 128" />
          <path className="waveband-link soft" d="M232 72C262 42 294 28 336 28C380 28 414 42 452 76" />
          <path className="waveband-link soft" d="M936 72C968 42 1002 28 1044 28C1088 28 1124 44 1160 80" />
          <circle className="waveband-sphere large sphere-peach" cx="54" cy="128" r="19" />
          <circle className="waveband-sphere large sphere-blue" cx="232" cy="72" r="21" />
          <circle className="waveband-sphere large sphere-rose" cx="584" cy="142" r="22" />
          <circle className="waveband-sphere large sphere-peach" cx="936" cy="72" r="20" />
          <circle className="waveband-sphere large sphere-blue" cx="1294" cy="140" r="21" />
          <circle className="waveband-sphere large sphere-rose" cx="1654" cy="84" r="20" />
          <circle className="waveband-sphere small sphere-rose" cx="452" cy="76" r="10" />
          <circle className="waveband-sphere small sphere-peach" cx="1160" cy="80" r="10" />
        </svg>
        <svg className="molecule-waveband band-front" viewBox="0 0 1800 180" role="presentation">
          <defs>
            <radialGradient id="sphere-gold-front" cx="34%" cy="28%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="30%" stopColor="#f8f4e8" />
              <stop offset="72%" stopColor="#d2c6a8" />
              <stop offset="100%" stopColor="#ad9f80" />
            </radialGradient>
            <radialGradient id="sphere-lilac-front" cx="34%" cy="28%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="30%" stopColor="#f1eef6" />
              <stop offset="72%" stopColor="#c5bfd1" />
              <stop offset="100%" stopColor="#a7a0b7" />
            </radialGradient>
            <radialGradient id="sphere-mist-front" cx="34%" cy="28%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="30%" stopColor="#eef3f3" />
              <stop offset="72%" stopColor="#becbcc" />
              <stop offset="100%" stopColor="#9eafb1" />
            </radialGradient>
          </defs>
          <path className="waveband-link crisp" d="M-160 96C-36 96 72 144 188 144C308 144 404 78 524 78C644 78 740 142 862 142C984 142 1088 86 1202 86C1320 86 1412 132 1530 132C1648 132 1746 96 1880 96" />
          <circle className="waveband-sphere medium sphere-gold" cx="16" cy="96" r="15" />
          <circle className="waveband-sphere medium sphere-lilac" cx="188" cy="144" r="16" />
          <circle className="waveband-sphere medium sphere-mist" cx="524" cy="78" r="16" />
          <circle className="waveband-sphere medium sphere-gold" cx="862" cy="142" r="15" />
          <circle className="waveband-sphere medium sphere-lilac" cx="1202" cy="86" r="16" />
          <circle className="waveband-sphere medium sphere-mist" cx="1530" cy="132" r="15" />
        </svg>
        <div className="molecule-haze haze-a" />
        <div className="molecule-haze haze-b" />
      </div>
      <div className="workspace-hero">
        <div className="brand-lockup">
          <div className="brand-cluster" aria-hidden="true">
            <div className="brand-echo echo-a"><BrandGlyph className="brand-glyph" /></div>
            <div className="brand-echo echo-b"><BrandGlyph className="brand-glyph" /></div>
            <div className="brand-echo echo-c"><BrandGlyph className="brand-glyph" /></div>
            <div className="brand-echo echo-d"><BrandGlyph className="brand-glyph" /></div>
            <div className="brand-mark main-mark"><BrandGlyph className="brand-glyph" /></div>
          </div>
          <div className="brand-meta">
            <strong>Annotation Platform</strong>
            <p>Patent annotation workbench</p>
          </div>
        </div>
      </div>
      {!fixedWorkspace && <div className="workspace-controls">
          <div className="folder-form">
            <input value={folderPath} onChange={(event) => setFolderPath(event.target.value)} placeholder={DEFAULT_FOLDER}/>
            <button onClick={() => {
              forwardFoldersRef.current = [];
              onPickWorkspace();
            }}><FolderOpen size={16}/> Open folder</button>
            {workspace.path && <button className="secondary-folder-button" onClick={onRefresh}><RefreshCw size={14}/> Refresh</button>}
          </div>
        </div>
      }
      {error && <div className="landing-error">{error}</div>}
    </section>
    <section className="file-browser">
      <header><div><strong>Folder contents</strong><span>{folderCount} folders · {rawFileCount} raw files</span></div><label><Search size={14}/><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search folders and files"/></label></header>
      <div className="file-table">
        {!workspace.path && <div className="empty-state">Open a working folder to browse folders and patent files.</div>}
        {workspace.path && !files.length && <div className="empty-state">No folders or supported `.md`, `.markdown`, `.txt`, or `.json` files found in this folder.</div>}
        {files.map((file) => {
          const isFolder = file.kind === "folder";
          return <button
            key={`${file.kind || "file"}:${file.path || file.document_id}`}
            className={`file-row ${isFolder ? "folder-row" : ""}`}
            onClick={() => isFolder ? file.path && openFolderFromList(file.path) : onOpenFile(file.document_id)}
          >
            <span className="file-kind-cell">{isFolder ? <FolderOpen size={15}/> : <span className={`status-dot ${statusClass(file.status)}`}></span>}</span>
            <strong>{file.document_id}</strong>
            <em>{isFolder ? "Folder" : file.status}</em>
            <span>{isFolder ? "Open folder" : `S${file.counts.substances} C${file.counts.compositions} P${file.counts.properties} M${file.counts.measurements}`}</span>
          </button>;
        })}
      </div>
    </section>
  </main>;
}

function Message({ tone, text, onClose }: { tone: "error" | "success"; text: string; onClose: () => void }) {
  return <div className={`app-message ${tone}`}><span>{text}</span><button onClick={onClose}><X size={13}/></button></div>;
}

function SelectionPopover({ selection, activeRecord, onCreate, onDismiss }: {
  selection: NonNullable<SelectionMenu>;
  activeRecord: ActiveRecord;
  onCreate: (type: EntityType) => void;
  onDismiss: () => void;
}) {
  return <div className="selection-popover">
    <button className="clip-close" onClick={onDismiss}><X size={13}/></button>
    <div className="selected-subspan">{selection.text}</div>
    <div className="picker-label">Create node</div>
    <div className="picker-grid">{(Object.keys(labels) as EntityType[]).map((type) => <button key={type} onClick={() => onCreate(type)}>{singular(type)}</button>)}</div>
    {activeRecord && <>
      <div className="picker-label">Selected node</div>
      <p className="selection-hint">Use an item-level Annotate button, or Add span under Evidence in the expanded node card.</p>
    </>}
  </div>;
}

function NodeAccordion({ type, state, activeRecord, editingRecord, selectionMenu, spanAdjustment, spanAdditionTarget, search, relationshipFilters, onSearchChange, onRelationshipFilterChange, onSelect, onEdit, onDelete, onUpdate, onAnnotateItem, onAddEvidenceSpan, onDone, onCollapse, onCreateComposition, onAdjustSpan }: {
  type: EntityType;
  state: AnnotationState;
  activeRecord: ActiveRecord;
  editingRecord: ActiveRecord;
  selectionMenu: SelectionMenu;
  spanAdjustment: SpanAdjustment;
  spanAdditionTarget: ActiveRecord;
  search: string;
  relationshipFilters: Partial<Record<NodeRelationshipFilterKey, boolean>>;
  onSearchChange: (value: string) => void;
  onRelationshipFilterChange: (key: NodeRelationshipFilterKey, value: boolean) => void;
  onSelect: (type: EntityType, nodeNo: number) => void;
  onEdit: (type: EntityType, nodeNo: number, editing: boolean) => void;
  onDelete: (type: EntityType, nodeNo: number) => void;
  onUpdate: (type: EntityType, nodeNo: number, patch: RecordPatch) => void;
  onAnnotateItem: (target: AnnotationTarget) => void;
  onAddEvidenceSpan: (type: EntityType, nodeNo: number) => void;
  onDone: (type: EntityType, nodeNo: number) => void;
  onCollapse: () => void;
  onCreateComposition: () => void;
  onAdjustSpan: (type: EntityType, nodeNo: number, field: string, index: number) => void;
}) {
  const records = state[type] as AnyRecord[];
  const query = search.trim().toLowerCase();
  const relationshipFilterOptions = relationshipFilterDefinitions(type);
  const filteredRecords = React.useMemo(() => records.filter((record) => {
    if (!recordMatchesRelationshipFilters(type, record, state, relationshipFilters)) return false;
    return !query || recordTitleText(type, record, state).toLowerCase().includes(query);
  }), [records, relationshipFilters, query, state, type]);
  if (!records.length) return <section className="node-workspace">
    <div className="node-workspace-header">
      <strong>{labels[type]}</strong>
      <div className="node-workspace-tools">
        {type === "compositions" && <button type="button" className="node-inline-action" onClick={onCreateComposition}>Create composition</button>}
        <span>0 nodes</span>
      </div>
    </div>
    <div className="empty-state">
      {type === "compositions" ? <>
        Create a composition directly, or highlight source text to seed one from the document.
        <div className="empty-state-actions">
          <button type="button" className="node-inline-action" onClick={onCreateComposition}>Create composition</button>
        </div>
      </> : `Highlight source text, then create a ${singular(type).toLowerCase()} node.`}
    </div>
  </section>;
  return <section className="node-workspace">
    <div className="node-workspace-header">
      <strong>{labels[type]}</strong>
      <div className="node-workspace-tools">
        {type === "compositions" && <button type="button" className="node-inline-action" onClick={onCreateComposition}>Create composition</button>}
        {relationshipFilterOptions.map((option) => {
          const active = Boolean(relationshipFilters[option.key]);
          return <button type="button" key={option.key} className={`node-filter-toggle ${active ? "active" : ""}`} onClick={() => onRelationshipFilterChange(option.key, !active)}>{option.label}</button>;
        })}
        <input className="node-search-input" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search node names"/>
        <span>{filteredRecords.length === records.length ? `${records.length} nodes. Click a node to expand details.` : `${filteredRecords.length} of ${records.length} nodes`}</span>
      </div>
    </div>
    {!filteredRecords.length && <div className="empty-state">No {labels[type].toLowerCase()} match "{search}".</div>}
    <div className="record-list">{filteredRecords.map((record) => {
    const active = activeRecord?.type === type && activeRecord.nodeNo === record.node_no;
    const editing = editingRecord?.type === type && editingRecord.nodeNo === record.node_no;
    return <article className={`record-summary-card ${active ? "active expanded" : ""} ${active ? (editing ? "editing" : "inspecting") : ""}`} data-record-type={type} data-record-node={record.node_no} key={record.node_no}>
      <div className="record-summary-top">
        <button className="record-main-button" onClick={() => onSelect(type, record.node_no)}>
          <span className="node-pill">{nodePrefix(type)}{record.node_no}</span>
          <strong className={`record-title ${type === "measurements" ? "measurement-record-title" : ""}`}>
            {renderRecordTitle(type, record, state)}
            {isUnlinkedNode(type, record, state) && <span className="unlinked-node-indicator">Unlinked</span>}
          </strong>
          <em>{record.evidence_spans.length ? "Evidence linked" : "No evidence"}</em>
        </button>
        <div className="record-actions">
          {active && <button className="confirm-button" onClick={() => onDone(type, record.node_no)}><CheckCircle2 size={13}/> Done</button>}
          <button className={editing ? "active-action" : ""} onClick={() => { onSelect(type, record.node_no); onEdit(type, record.node_no, editing); }}><Edit3 size={13}/> {editing ? "Finish edit" : "Edit"}</button>
          <button onClick={() => onDelete(type, record.node_no)}><Trash2 size={13}/></button>
        </div>
      </div>
      {active && <div className={`node-details ${editing ? "editing-details" : "readonly-details"}`}>
        {editing ? <>
          {type === "substances" && <SubstanceForm record={record as SubstanceRecord} selectionMenu={selectionMenu} editing={editing} onAnnotate={onAnnotateItem} onUpdate={(patch) => onUpdate(type, record.node_no, patch)}/>}
          {type === "compositions" && <CompositionForm record={record as CompositionRecord} state={state} selectionMenu={selectionMenu} editing={editing} onAnnotate={onAnnotateItem} onUpdate={(patch) => onUpdate(type, record.node_no, patch)}/>}
          {type === "properties" && <PropertyForm record={record as PropertyRecord} state={state} selectionMenu={selectionMenu} editing={editing} onAnnotate={onAnnotateItem} onUpdate={(patch) => onUpdate(type, record.node_no, patch)}/>}
          {type === "measurements" && <MeasurementForm record={record as MeasurementRecord} state={state} selectionMenu={selectionMenu} editing={editing} onAnnotate={onAnnotateItem} onUpdate={(patch) => onUpdate(type, record.node_no, patch)}/>}
          <EvidencePanel record={record} type={type} editing addingSpan={spanAdditionTarget?.type === type && spanAdditionTarget.nodeNo === record.node_no} adjustingSpan={spanAdjustment} onAddSpan={() => onAddEvidenceSpan(type, record.node_no)} onAdjustSpan={(field, index) => onAdjustSpan(type, record.node_no, field, index)}/>
        </> : <ReadOnlyNodeCard type={type} record={record} state={state}/>}
      </div>}
    </article>;
  })}</div>
  </section>;
}

function ReadOnlyNodeCard({ type, record, state }: { type: EntityType; record: AnyRecord; state: AnnotationState }) {
  if (type === "substances") {
    const substance = record as SubstanceRecord;
    const linkedProperties = propertiesLinkedToNode(state, substance.node_no);
    return <div className="summary-grid">
      <SummaryField label="Substance name" value={substance.substance_name}/>
      <SummaryField label="Substance type" value={substance.substance_type}/>
      <SummaryField label="Manufacturer" value={substance.manufacturer}/>
      <SummaryField label="Physical form" value={substance.physical_form}/>
      <SummaryCollection
        label="Linked properties"
        empty="No properties linked."
        items={linkedProperties.map((property) => ({
          title: `${nodePrefix("properties")}${property.node_no} ${property.property_name}`,
          detail: property.property_type,
        }))}
      />
          <EvidencePanel record={record} compact/>
    </div>;
  }
  if (type === "compositions") {
    const composition = record as CompositionRecord;
    const linkedProperties = propertiesLinkedToNode(state, composition.node_no);
    return <div className="summary-grid">
      <SummaryField label="Composition name" value={composition.composition_name}/>
      <SummaryField label="Composition type" value={composition.composition_type}/>
      <SummaryField label="Physical form" value={composition.physical_form}/>
      <SummaryCollection
        label="Constituents"
        empty="No constituents linked."
        items={composition.constituents.map((item) => ({
          title: lookupLinkedTargetName(state, item.constituent_ref),
          detail: constituentAmountText(item),
          meta: item.constituent_status,
        }))}
      />
      <SummaryCollection
        label="Linked properties"
        empty="No properties linked."
        items={linkedProperties.map((property) => ({
          title: `${nodePrefix("properties")}${property.node_no} ${property.property_name}`,
          detail: property.property_type,
        }))}
      />
          <EvidencePanel record={record} compact/>
    </div>;
  }
  if (type === "properties") {
    const property = record as PropertyRecord;
    return <div className="summary-grid">
      <SummaryField label="Property name" value={property.property_name}/>
      <SummaryField label="Property type" value={property.property_type}/>
      <SummaryCollection
        label="Targets"
        empty="No linked targets."
        items={property.target_ref > 0 ? [{
          title: lookupLinkedTargetName(state, property.target_ref),
          detail: `Ref ${property.target_ref}`,
        }] : []}
      />
      <EvidencePanel record={record} compact/>
    </div>;
  }
  const measurement = record as MeasurementRecord;
  return <div className="summary-grid">
    <SummaryField label="Measurement type" value={measurement.measurement_type}/>
    <SummaryField label="Comparator" value={measurement.comparator}/>
    <SummaryField label="Value(s)" value={arrayToText(measurement.value) || "-"}/>
    <SummaryField label="Unit(s)" value={arrayToText(measurement.unit) || "-"}/>
    <SummaryField label="Lower value" value={String(measurement.lower_value)}/>
    <SummaryField label="Upper value" value={String(measurement.upper_value)}/>
    <SummaryCollection
      label="Measurement conditions"
      empty="No measurement conditions."
      items={measurement.measurement_conditions.map((condition) => ({
        title: condition.condition_name || "-",
        detail: arrayToText(condition.condition_value) || "-",
        meta: arrayToText(condition.condition_unit) || "-",
      }))}
    />
    <EvidencePanel record={record} compact/>
  </div>;
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return <div className="summary-field">
    <span>{label}</span>
    <strong>{value && value.trim() ? value : "-"}</strong>
  </div>;
}

function SummaryCollection({ label, items, empty }: { label: string; items: Array<{ title: string; detail?: string; meta?: string }>; empty: string }) {
  return <div className="summary-collection">
    <div className="summary-collection-header">{label}</div>
    {!items.length && <div className="summary-empty">{empty}</div>}
    {!!items.length && <div className="summary-list">{items.map((item, index) => <div key={`${item.title}-${index}`} className="summary-list-item">
      <strong>{item.title}</strong>
      {item.detail && <span>{item.detail}</span>}
      {item.meta && <em>{item.meta}</em>}
    </div>)}</div>}
  </div>;
}

function SubstanceForm({ record, selectionMenu, editing, onAnnotate, onUpdate }: { record: SubstanceRecord; selectionMenu: SelectionMenu; editing: boolean; onAnnotate: (target: AnnotationTarget) => void; onUpdate: (patch: RecordPatch) => void }) {
  return <div className="form-grid">
    <TextField label="Substance name" value={record.substance_name} editing={editing} annotation={annotationProps(record, selectionMenu, { field: "substance_name", label: "Substance name", kind: "text" }, onAnnotate)} onChange={(value) => onUpdate({ substance_name: value })}/>
    <SelectField label="Substance type" value={record.substance_type} options={["canonical", "commercial", "formula", "raw"]} editing={editing} onChange={(value) => onUpdate({ substance_type: value as SubstanceType })}/>
    <TextField label="Manufacturer" value={record.manufacturer} editing={editing} annotation={annotationProps(record, selectionMenu, { field: "manufacturer", label: "Manufacturer", kind: "text" }, onAnnotate)} onChange={(value) => onUpdate({ manufacturer: value })}/>
    <TextField label="Physical form" value={record.physical_form} editing={editing} annotation={annotationProps(record, selectionMenu, { field: "physical_form", label: "Physical form", kind: "text" }, onAnnotate)} onChange={(value) => onUpdate({ physical_form: value })}/>
  </div>;
}

function CompositionForm({ record, state, selectionMenu, editing, onAnnotate, onUpdate }: { record: CompositionRecord; state: AnnotationState; selectionMenu: SelectionMenu; editing: boolean; onAnnotate: (target: AnnotationTarget) => void; onUpdate: (patch: RecordPatch) => void }) {
  const updateConstituent = (index: number, patch: Partial<ConstituentRecord>) => onUpdate((current) => ({ constituents: (current as CompositionRecord).constituents.map((item, itemIndex) => itemIndex === index ? normalizeConstituent({ ...item, ...patch }) : item) }));
  const constituentCandidates = React.useMemo(() => compositionConstituentCandidates(state, record), [record, state]);
  const addConstituent = (candidate: LinkCandidate) => {
    onUpdate((current) => ({
      constituents: [...(current as CompositionRecord).constituents, defaultConstituent(candidate.nodeNo)]
    }));
  };
  return <div className="form-grid">
    <TextField label="Composition name" value={record.composition_name} editing={editing} annotation={annotationProps(record, selectionMenu, { field: "composition_name", label: "Composition name", kind: "text" }, onAnnotate)} onChange={(value) => onUpdate({ composition_name: value })}/>
    <TextField label="Composition type" value={record.composition_type} editing={editing} annotation={annotationProps(record, selectionMenu, { field: "composition_type", label: "Composition type", kind: "text" }, onAnnotate)} onChange={(value) => onUpdate({ composition_type: value })}/>
    <TextField label="Physical form" value={record.physical_form} editing={editing} annotation={annotationProps(record, selectionMenu, { field: "physical_form", label: "Physical form", kind: "text" }, onAnnotate)} onChange={(value) => onUpdate({ physical_form: value })}/>
    <div className="wide-field constituent-editor"><strong>Constituents</strong>
      {!record.constituents.length && <span className="muted">No constituents linked yet. Use the graph or add a candidate manually.</span>}
      {editing && <LinkCandidatePicker
        label="Add constituent"
        placeholder="Search substances or compositions"
        candidates={constituentCandidates}
        empty="No valid constituent candidates."
        onPick={addConstituent}
      />}
      {record.constituents.map((item, index) => {
        const linkedName = lookupLinkedTargetName(state, item.constituent_ref);
        const excluded = item.constituent_status === "excluded";
        const range = item.amount_comparator === "range";
        const scalarAmount = item.amount_comparator !== "range" && item.amount_comparator !== "balance" && item.amount_comparator !== "-";
        const amountEditing = editing && !excluded;
        const updateConstituentStatus = (status: ConstituentStatus) => updateConstituent(index, status === "excluded" ? {
          constituent_status: status,
          amount_comparator: "-",
          amount_value: "-",
          amount_unit: "-",
          amount_lower_value: "-",
          amount_upper_value: "-"
        } : { constituent_status: status });
        const showScalarValue = amountEditing && scalarAmount;
        const showRangeValues = amountEditing && range;
        const showUnit = amountEditing && item.amount_comparator !== "-";
        const amountHint = excluded ? "Excluded constituent: amount fields are disabled." : "Choose a comparator to enter amount details.";
        return <div className={`constituent-row ${excluded ? "excluded" : ""}`} key={`${item.constituent_ref}-${index}`}>
          <div className="constituent-row-header">
            <span className="linked-node">{linkedName}</span>
            <select disabled={!editing} value={item.constituent_status === "-" ? "included" : item.constituent_status} onChange={(event) => updateConstituentStatus(event.target.value as ConstituentStatus)}><option value="included">included</option><option value="excluded">excluded</option><option value="optional">optional</option></select>
            {editing && <button className="constituent-remove-button" onClick={() => onUpdate((current) => ({ constituents: (current as CompositionRecord).constituents.filter((_, itemIndex) => itemIndex !== index) }))}><X size={12}/></button>}
          </div>
          <div className="constituent-amount-panel">
            <span className="amount-panel-title">Amount</span>
            <div className="amount-grid">
              <label className="amount-field amount-comparator-field"><span>Comparator</span><select disabled={!amountEditing} value={item.amount_comparator} onChange={(event) => updateConstituent(index, { amount_comparator: event.target.value as AmountComparator })}><option value="-">-</option><option value="=">=</option><option value=">">&gt;</option><option value="<">&lt;</option><option value=">=">&gt;=</option><option value="<=">&lt;=</option><option value="approx">approx</option><option value="range">range</option><option value="balance">balance</option></select></label>
              {showScalarValue && <div className="amount-field"><span>Value</span><SubItemInput value={String(item.amount_value ?? "")} placeholder="value" editing={showScalarValue} annotation={annotationProps(record, selectionMenu, { field: `constituents.${index}.amount_value`, label: `${linkedName} amount value`, kind: "text" }, onAnnotate)} onChange={(value) => updateConstituent(index, { amount_value: value || "-" })}/></div>}
              {showRangeValues && <div className="amount-field"><span>Lower</span><SubItemInput value={String(item.amount_lower_value ?? "")} placeholder="lower" editing={showRangeValues} annotation={annotationProps(record, selectionMenu, { field: `constituents.${index}.amount_lower_value`, label: `${linkedName} lower amount`, kind: "text" }, onAnnotate)} onChange={(value) => updateConstituent(index, { amount_lower_value: value || "-" })}/></div>}
              {showRangeValues && <div className="amount-field"><span>Upper</span><SubItemInput value={String(item.amount_upper_value ?? "")} placeholder="upper" editing={showRangeValues} annotation={annotationProps(record, selectionMenu, { field: `constituents.${index}.amount_upper_value`, label: `${linkedName} upper amount`, kind: "text" }, onAnnotate)} onChange={(value) => updateConstituent(index, { amount_upper_value: value || "-" })}/></div>}
              {showUnit && <div className="amount-field"><span>Unit</span><SubItemInput value={item.amount_unit} placeholder="unit" editing={showUnit} annotation={annotationProps(record, selectionMenu, { field: `constituents.${index}.amount_unit`, label: `${linkedName} amount unit`, kind: "text" }, onAnnotate)} onChange={(value) => updateConstituent(index, { amount_unit: value || "-" })}/></div>}
              {!showScalarValue && !showRangeValues && !showUnit && <span className="amount-empty">{amountHint}</span>}
            </div>
          </div>
        </div>;
      })}
    </div>
  </div>;
}

function PropertyForm({ record, state, selectionMenu, editing, onAnnotate, onUpdate }: { record: PropertyRecord; state: AnnotationState; selectionMenu: SelectionMenu; editing: boolean; onAnnotate: (target: AnnotationTarget) => void; onUpdate: (patch: RecordPatch) => void }) {
  const targetCandidates = React.useMemo(() => propertyTargetCandidates(state, record), [record, state]);
  const setTarget = (candidate: LinkCandidate) => onUpdate({ target_ref: candidate.nodeNo });
  const removeTarget = () => onUpdate({ target_ref: 0 });
  return <div className="form-grid">
    <TextField label="Property name" value={record.property_name} editing={editing} annotation={annotationProps(record, selectionMenu, { field: "property_name", label: "Property name", kind: "text" }, onAnnotate)} onChange={(value) => onUpdate({ property_name: value })}/>
    <SelectField label="Property type" value={normalizePropertyType(record.property_type)} options={["intrinsic", "extrinsic", "performance"]} editing={editing} onChange={(value) => onUpdate({ property_type: value as PropertyType })}/>
    <div className="wide-field relationship-editor"><strong>Linked targets</strong>
      {record.target_ref <= 0 && <span className="muted">No substance or composition linked yet.</span>}
      {editing && <LinkCandidatePicker
        label={record.target_ref > 0 ? "Replace target" : "Add target"}
        placeholder="Search substances or compositions"
        candidates={targetCandidates}
        empty="No valid target candidates."
        onPick={setTarget}
      />}
      {record.target_ref > 0 && <div className="linked-relationship-list"><LinkedRelationshipRow
        title={lookupLinkedTargetName(state, record.target_ref)}
        meta={`Ref ${record.target_ref}`}
        editing={editing}
        onRemove={removeTarget}
      /></div>}
    </div>
  </div>;
}

function MeasurementForm({ record, state, selectionMenu, editing, onAnnotate, onUpdate }: { record: MeasurementRecord; state: AnnotationState; selectionMenu: SelectionMenu; editing: boolean; onAnnotate: (target: AnnotationTarget) => void; onUpdate: (patch: RecordPatch) => void }) {
  const updateCondition = (index: number, patch: Partial<MeasurementCondition>) => onUpdate((current) => ({ measurement_conditions: (current as MeasurementRecord).measurement_conditions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  const quantitative = record.measurement_type === "quantitative";
  const range = record.comparator === "range";
  const propertyCandidates = React.useMemo(() => measurementPropertyCandidates(state, record), [record, state]);
  const linkedProperty = state.properties.find((property) => property.node_no === record.property_ref);
  return <div className="form-grid">
    <SelectField label="Measurement type" value={record.measurement_type} options={["quantitative", "qualitative"]} editing={editing} onChange={(value) => onUpdate({ measurement_type: value as MeasurementType })}/>
    <TextField label="Value(s)" value={arrayToText(record.value)} editing={editing && !range} annotation={annotationProps(record, selectionMenu, { field: "value", label: "Value", kind: "mixedArray" }, onAnnotate)} onChange={(value) => onUpdate({ value: textToDraftArray(value) })}/>
    <SelectField label="Comparator" value={record.comparator} options={["-", "=", ">", "<", ">=", "<=", "approx", "range"]} editing={editing && quantitative} onChange={(value) => onUpdate({ comparator: value as Comparator })}/>
    <TextField label="Unit(s)" value={arrayToText(record.unit)} editing={editing && quantitative} annotation={quantitative ? annotationProps(record, selectionMenu, { field: "unit", label: "Unit", kind: "stringArray" }, onAnnotate) : undefined} onChange={(value) => onUpdate({ unit: textToDraftStringArray(value) })}/>
    <TextField label="Lower value" value={String(record.lower_value)} editing={editing && quantitative && range} annotation={range ? annotationProps(record, selectionMenu, { field: "lower_value", label: "Lower value", kind: "text" }, onAnnotate) : undefined} onChange={(value) => onUpdate({ lower_value: value || "-" })}/>
    <TextField label="Upper value" value={String(record.upper_value)} editing={editing && quantitative && range} annotation={range ? annotationProps(record, selectionMenu, { field: "upper_value", label: "Upper value", kind: "text" }, onAnnotate) : undefined} onChange={(value) => onUpdate({ upper_value: value || "-" })}/>
    <div className="wide-field relationship-editor"><strong>Linked property</strong>
      {linkedProperty ? <LinkedRelationshipRow
        title={`${nodePrefix("properties")}${linkedProperty.node_no} ${linkedProperty.property_name}`}
        meta={linkedProperty.property_type}
        editing={editing}
        onRemove={() => onUpdate({ property_ref: 0 })}
      /> : <span className="muted">No property linked yet.</span>}
      {editing && <LinkCandidatePicker
        label={linkedProperty ? "Change property" : "Link property"}
        placeholder="Search properties"
        candidates={propertyCandidates}
        empty="No property candidates."
        onPick={(candidate) => onUpdate({ property_ref: candidate.nodeNo })}
      />}
    </div>
    <div className="wide-field measurement-rule-note">
      {range ? "Range rule: comparator stays `range`, Value(s) stays empty, and bounds belong in Lower value and Upper value." : record.measurement_type === "qualitative" ? "Qualitative rule: comparator stays `-`, unit stays `-`, and lower/upper bounds stay `-`." : "Quantitative rule: exact, approximate, and comparative values belong in Value(s); lower/upper bounds are only for ranges."}
    </div>
    <div className="wide-field condition-box"><strong>Measurement conditions</strong>
      {record.measurement_conditions.map((condition, index) => <div className="condition-row" key={index}>
        <SubItemInput value={condition.condition_name} placeholder="Condition" editing={editing} annotation={annotationProps(record, selectionMenu, { field: `measurement_conditions.${index}.condition_name`, label: `Condition ${index + 1} name`, kind: "text" }, onAnnotate)} onChange={(value) => updateCondition(index, { condition_name: value || "-" })}/>
        <SubItemInput value={arrayToText(condition.condition_value)} placeholder="Value(s)" editing={editing} annotation={annotationProps(record, selectionMenu, { field: `measurement_conditions.${index}.condition_value`, label: `Condition ${index + 1} value`, kind: "mixedArray" }, onAnnotate)} onChange={(value) => updateCondition(index, { condition_value: textToDraftArray(value) })}/>
        <SubItemInput value={arrayToText(condition.condition_unit)} placeholder="Unit(s)" editing={editing} annotation={annotationProps(record, selectionMenu, { field: `measurement_conditions.${index}.condition_unit`, label: `Condition ${index + 1} unit`, kind: "stringArray" }, onAnnotate)} onChange={(value) => updateCondition(index, { condition_unit: textToDraftStringArray(value) })}/>
        {editing && <button onClick={() => onUpdate((current) => ({ measurement_conditions: (current as MeasurementRecord).measurement_conditions.filter((_, itemIndex) => itemIndex !== index) }))}><X size={12}/></button>}
      </div>)}
      <button onClick={() => onUpdate((current) => ({ measurement_conditions: [...(current as MeasurementRecord).measurement_conditions, { condition_name: "-", condition_value: [], condition_unit: [] }] }))}>Add condition</button>
    </div>
  </div>;
}

function LinkCandidatePicker({ label, placeholder, candidates, empty, onPick }: { label: string; placeholder: string; candidates: LinkCandidate[]; empty: string; onPick: (candidate: LinkCandidate) => void }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const visibleCandidates = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? candidates.filter((candidate) => `${nodePrefix(candidate.type)}${candidate.nodeNo} ${candidate.title} ${candidate.meta || ""}`.toLowerCase().includes(normalized))
      : candidates;
    return filtered.slice(0, LINK_CANDIDATE_LIMIT);
  }, [candidates, query]);
  return <div className="candidate-picker">
    <button type="button" className={`node-inline-action candidate-picker-toggle ${open ? "active" : ""}`} onClick={() => setOpen((value) => !value)}><Plus size={12}/> {label}</button>
    {open && <div className="candidate-menu">
      <input className="candidate-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} autoFocus/>
      <div className="candidate-table">
        {!visibleCandidates.length && <div className="candidate-empty">{empty}</div>}
        {visibleCandidates.map((candidate) => <button
          type="button"
          className="candidate-row"
          key={`${candidate.type}-${candidate.nodeNo}`}
          onClick={() => {
            onPick(candidate);
            setQuery("");
            setOpen(false);
          }}
        >
          <span className={`candidate-node-pill ${candidate.type}`}>{nodePrefix(candidate.type)}{candidate.nodeNo}</span>
          <strong>{candidate.title}</strong>
          <em>{candidate.meta || singular(candidate.type)}</em>
        </button>)}
      </div>
      {candidates.length > LINK_CANDIDATE_LIMIT && visibleCandidates.length === LINK_CANDIDATE_LIMIT && <span className="candidate-limit-note">Showing first {LINK_CANDIDATE_LIMIT}. Search to narrow.</span>}
    </div>}
  </div>;
}

function LinkedRelationshipRow({ title, meta, editing, onRemove }: { title: string; meta?: string; editing: boolean; onRemove: () => void }) {
  return <div className="linked-relationship-row">
    <span className="linked-node">{title}</span>
    {meta && <em>{meta}</em>}
    {editing && <button type="button" onClick={onRemove}><X size={12}/></button>}
  </div>;
}

function BufferedTextInput({ value, editing, placeholder, onCommit }: { value: string; editing: boolean; placeholder?: string; onCommit: (value: string) => void }) {
  const id = React.useId();
  const pendingFieldCommits = React.useContext(PendingFieldCommitContext);
  const displayedValue = editableFieldValue(value, editing);
  const [draft, setDraft] = React.useState(displayedValue);
  const dirtyRef = React.useRef(false);
  const latestRef = React.useRef({ draft, displayedValue, onCommit });

  latestRef.current = { draft, displayedValue, onCommit };

  const commitRef = React.useRef<PendingFieldCommit>(() => {});
  commitRef.current = () => {
    const latest = latestRef.current;
    if (!dirtyRef.current) {
      pendingFieldCommits.register(id, null);
      return;
    }
    dirtyRef.current = false;
    pendingFieldCommits.register(id, null);
    if (latest.draft !== latest.displayedValue) latest.onCommit(latest.draft);
  };

  React.useEffect(() => {
    if (!editing) {
      dirtyRef.current = false;
      pendingFieldCommits.register(id, null);
      setDraft(displayedValue);
      return;
    }
    if (!dirtyRef.current) setDraft(displayedValue);
  }, [displayedValue, editing, id, pendingFieldCommits]);

  React.useEffect(() => () => pendingFieldCommits.register(id, null), [id, pendingFieldCommits]);

  return <input
    readOnly={!editing}
    value={draft}
    placeholder={placeholder}
    onChange={(event) => {
      const nextValue = event.target.value;
      setDraft(nextValue);
      dirtyRef.current = true;
      pendingFieldCommits.markDirty();
      pendingFieldCommits.register(id, () => commitRef.current());
    }}
    onBlur={() => commitRef.current()}
    onKeyDown={(event) => {
      if (event.key === "Enter" && !(event.nativeEvent as KeyboardEvent).isComposing) commitRef.current();
    }}
  />;
}

function TextField({ label, value, editing, annotation, onChange }: { label: string; value: string; editing: boolean; annotation?: AnnotationControlProps; onChange: (value: string) => void }) {
  return <div className="field-card"><FieldHeader label={label} annotation={annotation}/><BufferedTextInput value={value} editing={editing} onCommit={onChange}/></div>;
}

function SelectField({ label, value, options, editing, onChange }: { label: string; value: string; options: string[]; editing: boolean; onChange: (value: string) => void }) {
  return <div className="field-card"><div className="field-card-header"><span>{label}</span><em>Manual</em></div><select value={value} disabled={!editing} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></div>;
}

type AnnotationControlProps = AnnotationTarget & { selectionMenu: SelectionMenu; annotated: boolean; onAnnotate: (target: AnnotationTarget) => void };

function annotationProps(record: AnyRecord, selectionMenu: SelectionMenu, target: AnnotationTarget, onAnnotate: (target: AnnotationTarget) => void): AnnotationControlProps {
  return { ...target, selectionMenu, annotated: hasAnnotation(record, target.field), onAnnotate };
}

function FieldHeader({ label, annotation }: { label: string; annotation?: AnnotationControlProps }) {
  return <div className="field-card-header"><span>{label}</span>{annotation && <AnnotationControl annotation={annotation}/>}</div>;
}

function AnnotationControl({ annotation }: { annotation: AnnotationControlProps }) {
  return <div className="annotation-control">
    {annotation.selectionMenu && <button onClick={() => annotation.onAnnotate(annotation)}><Link2 size={12}/> Annotate</button>}
  </div>;
}

function SubItemInput({ value, placeholder, editing, annotation, onChange }: { value: string; placeholder: string; editing: boolean; annotation: AnnotationControlProps; onChange: (value: string) => void }) {
  return <div className="subitem-field">
    <BufferedTextInput value={value} editing={editing} onCommit={onChange} placeholder={placeholder}/>
    <AnnotationControl annotation={annotation}/>
  </div>;
}

function EvidencePanel({ record, type, compact = false, editing = false, addingSpan = false, adjustingSpan, onAddSpan, onAdjustSpan }: { record: AnyRecord; type?: EntityType; compact?: boolean; editing?: boolean; addingSpan?: boolean; adjustingSpan?: SpanAdjustment; onAddSpan?: () => void; onAdjustSpan?: (field: string, index: number) => void }) {
  const spans = record.evidence_spans
    .map((span, index) => ({ span, index }))
    .filter(({ span }) => span.text && span.text !== "-");
  return <div className={`evidence-box ${compact ? "compact" : ""}`}>
    <div className="evidence-box-header">
      <strong>Evidence</strong>
      {!compact && editing && onAddSpan && <button type="button" className={`evidence-add-button ${addingSpan ? "active" : ""}`} onClick={onAddSpan}><Link2 size={12}/> {addingSpan ? "Adding..." : "Add span"}</button>}
    </div>
    {!spans.length && <p>No evidence linked yet.</p>}
    {!!spans.length && <div className="evidence-list">{spans.map(({ span, index }) => <div key={`${span.field}-${index}`} className="evidence-chip">
      <div className="evidence-chip-header">
        <span>{fieldDisplayName(span.field)}</span>
        {!compact && editing && onAdjustSpan && type && typeof span.start === "number" && typeof span.end === "number" && <button
          type="button"
          className={`evidence-adjust-button ${adjustingSpan?.type === type && adjustingSpan.nodeNo === record.node_no && adjustingSpan.field === span.field && adjustingSpan.index === index ? "active" : ""}`}
          onClick={() => onAdjustSpan(span.field, index)}
        >{adjustingSpan?.type === type && adjustingSpan.nodeNo === record.node_no && adjustingSpan.field === span.field && adjustingSpan.index === index ? "Adjusting..." : "Adjust span"}</button>}
      </div>
      <em>{span.text}</em>
    </div>)}</div>}
  </div>;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function OverlapInspector({ inspector, state, onFocus, onClose }: { inspector: NonNullable<SpanInspector>; state: AnnotationState; onFocus: (span: AnnotatedSpan) => void; onClose: () => void }) {
  const margin = 12;
  const width = Math.min(328, Math.max(220, window.innerWidth - margin * 2));
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - 260);
  const style = {
    left: clampNumber(inspector.x + 12, margin, maxLeft),
    top: clampNumber(inspector.y + 12, margin, maxTop),
    width,
  } as React.CSSProperties;
  return <div className="overlap-inspector" style={style}>
    <header>
      <div><strong>Overlapping annotations</strong><span>{inspector.text}</span></div>
      <button onClick={onClose}><X size={13}/></button>
    </header>
    <div className="overlap-list">
      {inspector.spans.map((span) => <button key={`${span.entityType}-${span.nodeNo}-${span.index}-${span.field}`} onClick={() => onFocus(span)}>
        <span className={`overlap-dot ${span.entityType}`}></span>
        <strong>{nodeLabel(state, { type: span.entityType, nodeNo: span.nodeNo })} · {fieldDisplayName(span.field)}</strong>
        <em>{span.identity ? "Parent identity" : "Sub-field annotation"}</em>
      </button>)}
    </div>
  </div>;
}

function FlexibleGraphEdge({ sourceX, sourceY, targetX, targetY, markerEnd, style, data }: EdgeProps<GraphEdgeData>) {
  const simpleMode = Boolean(data?.simpleMode);
  const lowDetail = Boolean(data?.lowDetail);
  const siblingOffset = data?.siblingOffset ?? 0;
  const startY = sourceY + (data?.sourceAnchorOffset ?? 0);
  const endY = targetY + (data?.targetAnchorOffset ?? 0);
  const horizontalGap = Math.max(108, Math.abs(targetX - sourceX) * 0.38);
  const c1x = sourceX + horizontalGap;
  const c2x = targetX - horizontalGap;
  const c1y = startY + siblingOffset;
  const c2y = endY - siblingOffset;
  const simplified = simpleMode || lowDetail;
  const path = simplified
    ? `M ${sourceX} ${startY} L ${targetX} ${endY}`
    : `M ${sourceX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${targetX} ${endY}`;
  const visualStyle = lowDetail ? { ...style, opacity: Math.min(Number(style?.opacity ?? 0.8), 0.55) } : style;
  const handleSelect = (event: React.MouseEvent<SVGPathElement> | React.PointerEvent<SVGPathElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    data?.onSelect?.(data.relationship);
  };
  return <>
    <path
      d={path}
      fill="none"
      markerEnd={simplified ? undefined : markerEnd}
      className="react-flow__edge-path"
      style={visualStyle}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
    <path
      d={path}
      fill="none"
      stroke="rgba(15, 23, 42, 0.001)"
      strokeWidth={24}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      pointerEvents="stroke"
      className="react-flow__edge-hitbox"
      onPointerDown={handleSelect}
      onClick={handleSelect}
    />
  </>;
}

function GraphDrawer({ state, linkSource, initialViewport, initialFilters, onViewportChange, onFiltersChange, onNodeClick, onBulkLink, onDuplicateNodes, onDeleteNodes, onLayoutChange, onRemoveRelationship, onClearSource, onClose }: { state: AnnotationState; linkSource: GraphRef | null; initialViewport: GraphViewport | null; initialFilters: GraphFilterState; onViewportChange: (viewport: GraphViewport) => void; onFiltersChange: (filters: GraphFilterState) => void; onNodeClick: (ref: GraphRef) => void; onBulkLink: (group: GraphNodeGroup, ref: GraphRef) => void; onDuplicateNodes: (refs: GraphRef[], step?: number) => void; onDeleteNodes: (refs: GraphRef[]) => void; onLayoutChange: (patch: GraphLayout) => void; onRemoveRelationship: (edge: RelationshipEdge) => void; onClearSource: () => void; onClose: () => void }) {
  const [overviewMode, setOverviewMode] = React.useState(false);
  const [filters, setFilters] = React.useState<GraphFilterState>(initialFilters);
  const [groupedNodes, setGroupedNodes] = React.useState<GraphNodeGroup | null>(null);
  const [copiedNodes, setCopiedNodes] = React.useState<GraphRef[]>([]);
  const [pasteStep, setPasteStep] = React.useState(1);
  const [isGraphMoving, setIsGraphMoving] = React.useState(false);
  const graph = React.useMemo(() => buildGraph(state, linkSource, groupedNodes, overviewMode, filters, null), [state, linkSource, groupedNodes, overviewMode, filters]);
  const [nodes, setNodes] = React.useState(graph.nodes);
  const [selectedNodeIds, setSelectedNodeIds] = React.useState<Set<string>>(new Set());
  const selectedNodeIdsRef = React.useRef<Set<string>>(new Set());
  const shiftKeyRef = React.useRef(false);
  const [selectedEdge, setSelectedEdge] = React.useState<RelationshipEdge | null>(null);
  const [flowInstance, setFlowInstance] = React.useState<ReactFlowInstance | null>(null);
  const [viewport, setViewport] = React.useState<GraphViewport>(initialViewport || { x: 0, y: 0, zoom: 1 });
  const [canvasSize, setCanvasSize] = React.useState({ width: 0, height: 0 });
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const visibleGraphRecordCount = React.useMemo(() => entityOrder.reduce((sum, type) => sum + (filters[type] ? state[type].length : 0), 0), [filters, state]);
  const largeGraphMode = visibleGraphRecordCount >= GRAPH_LARGE_NODE_THRESHOLD;
  const lowDetailGraph = largeGraphMode && (isGraphMoving || viewport.zoom <= GRAPH_LOW_DETAIL_ZOOM);
  React.useEffect(() => {
    selectedNodeIdsRef.current = selectedNodeIds;
  }, [selectedNodeIds]);
  React.useEffect(() => {
    setNodes(applyGraphNodeSelection(graph.nodes, selectedNodeIdsRef.current));
  }, [graph.nodes]);
  React.useEffect(() => {
    setSelectedNodeIds((current) => {
      const visibleIds = new Set(graph.nodes.map((node) => node.id));
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return setsEqual(current, next) ? current : next;
    });
  }, [graph.nodes]);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") shiftKeyRef.current = true;
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") shiftKeyRef.current = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);
  React.useEffect(() => {
    if (!initialViewport) return;
    setViewport(initialViewport);
  }, [initialViewport]);
  React.useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);
  React.useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const update = () => setCanvasSize({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  React.useEffect(() => {
    if (!flowInstance || !overviewMode) return;
    const frame = window.requestAnimationFrame(() => {
      void flowInstance.fitView({ padding: 0.42, duration: 220 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [flowInstance, overviewMode, graph.nodes]);
  React.useEffect(() => {
    if (!flowInstance || !initialViewport || overviewMode) return;
    const frame = window.requestAnimationFrame(() => {
      void flowInstance.setViewport(initialViewport, { duration: 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [flowInstance, initialViewport, overviewMode]);
  React.useEffect(() => {
    if (!linkSource) return;
    setSelectedEdge(null);
  }, [linkSource]);
  React.useEffect(() => {
    if (!groupedNodes) return;
    setSelectedEdge(null);
  }, [groupedNodes]);
  React.useEffect(() => {
    setNodes((current) => applyGraphNodeSelection(current, selectedNodeIds));
  }, [selectedNodeIds]);
  const selectedGraphRefs = React.useMemo(() => [...selectedNodeIds].map(parseGraphNode).filter((node): node is GraphRef => Boolean(node)), [selectedNodeIds]);
  const edgeTypes = React.useMemo(() => ({ flexible: FlexibleGraphEdge }), []);
  const groupableSelection = React.useMemo(() => {
    if (selectedGraphRefs.length < 2) return null;
    const [first, ...rest] = selectedGraphRefs;
    if (!rest.every((item) => item.type === first.type)) return null;
    return { type: first.type, nodeNos: Array.from(new Set(selectedGraphRefs.map((item) => item.nodeNo))) } as GraphNodeGroup;
  }, [selectedGraphRefs]);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && !event.repeat && event.key.toLowerCase() === "c") {
        if (!selectedGraphRefs.length) return;
        event.preventDefault();
        setCopiedNodes(selectedGraphRefs);
        setPasteStep(1);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && !event.repeat && event.key.toLowerCase() === "v") {
        if (!copiedNodes.length) return;
        event.preventDefault();
        onDuplicateNodes(copiedNodes, pasteStep);
        setPasteStep((current) => current + 1);
        return;
      }
      if (event.key !== "Delete") return;
      if (selectedEdge) {
        event.preventDefault();
        onRemoveRelationship(selectedEdge);
        setSelectedEdge(null);
        return;
      }
      if (!selectedGraphRefs.length) return;
      event.preventDefault();
      onDeleteNodes(selectedGraphRefs);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEdge, selectedGraphRefs, copiedNodes, pasteStep, onDuplicateNodes, onDeleteNodes, onRemoveRelationship]);
  React.useEffect(() => {
    if (!groupedNodes) return;
    const visibleNodeNos = new Set((state[groupedNodes.type] as AnyRecord[]).map((record) => record.node_no));
    const nextNodeNos = groupedNodes.nodeNos.filter((nodeNo) => visibleNodeNos.has(nodeNo));
    if (nextNodeNos.length > 1) {
      if (nextNodeNos.length !== groupedNodes.nodeNos.length) setGroupedNodes({ ...groupedNodes, nodeNos: nextNodeNos });
      return;
    }
    setGroupedNodes(null);
  }, [groupedNodes, state]);
  const onNodesChange = React.useCallback((changes: NodeChange[]) => {
    const selectionChanges = changes.filter((change) => change.type === "select");
    const movementChanges = changes.filter((change) => change.type !== "select");
    if (movementChanges.length) setNodes((current) => applyGraphMovementChanges(movementChanges, current));
    if (!selectionChanges.length || shiftKeyRef.current) return;
    setSelectedNodeIds((current) => {
      const next = new Set(current);
      selectionChanges.forEach((change) => {
        if (change.type !== "select") return;
        if (change.selected) next.add(change.id);
        else next.delete(change.id);
      });
      return setsEqual(current, next) ? current : next;
    });
  }, []);
  const graphInteractionLocked = Boolean(linkSource || groupedNodes);
  const edges = React.useMemo(() => graph.edges.map((edge) => {
    const base = edge.id === selectedEdge?.id ? {
      ...edge,
      animated: true,
      style: { ...(edge.style || {}), stroke: "#0f172a", strokeWidth: 3.6, opacity: 1 },
      zIndex: 1
    } : selectedEdge ? { ...edge, style: { ...(edge.style || {}), opacity: 0.28 } } : edge;
    return {
      ...base,
      data: {
        ...(base.data as GraphEdgeData | undefined),
        onSelect: setSelectedEdge,
        simpleMode: isGraphMoving,
        lowDetail: lowDetailGraph
      }
    };
  }), [graph.edges, selectedEdge, isGraphMoving, lowDetailGraph]);
  const offscreenNodes = isGraphMoving ? graph.nodes : nodes;
  const offscreen = React.useMemo(() => countOffscreenNodes(offscreenNodes, viewport, canvasSize), [offscreenNodes, viewport, canvasSize]);
  const hasGraphRecords = React.useMemo(() => entityOrder.some((type) => filters[type] && state[type].length), [filters, state]);

  const zoomIn = () => {
    setOverviewMode(false);
    void flowInstance?.zoomIn({ duration: 160 });
  };
  const zoomOut = () => {
    void flowInstance?.zoomOut({ duration: 160 });
  };
  const fitOverview = () => {
    setSelectedEdge(null);
    setOverviewMode(true);
  };
  const arrangeByCategory = () => {
    onLayoutChange(autoArrangeGraphLayout(state, filters));
    setOverviewMode(false);
    window.setTimeout(() => void flowInstance?.fitView({ padding: 0.18, duration: 220 }), 40);
  };
  const toggleFilter = (type: EntityType) => {
    setFilters((current) => {
      const next = { ...current, [type]: !current[type] };
      const resolved = Object.values(next).some(Boolean) ? next : current;
      onFiltersChange(resolved);
      return resolved;
    });
  };
  const createGroupFromSelection = () => {
    if (!groupableSelection) return;
    setGroupedNodes(groupableSelection);
    setSelectedEdge(null);
    setSelectedNodeIds(new Set());
  };
  const clearGroupedNodes = () => setGroupedNodes(null);
  const addNodeToSelection = React.useCallback((nodeId: string) => {
    onClearSource();
    setSelectedEdge(null);
    setSelectedNodeIds((current) => current.has(nodeId) ? current : new Set([...current, nodeId]));
  }, [onClearSource]);
  const handleGraphMouseDownCapture = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!event.shiftKey || event.button !== 0 || groupedNodes) return;
    const target = event.target instanceof Element ? event.target : null;
    const nodeElement = target?.closest(".react-flow__node") as HTMLElement | null;
    const nodeId = nodeElement?.dataset.id;
    if (!nodeId || !parseGraphNode(nodeId)) return;
    shiftKeyRef.current = true;
    event.preventDefault();
    event.stopPropagation();
    addNodeToSelection(nodeId);
  }, [addNodeToSelection, groupedNodes]);

  return <div className="graph-drawer-shell">
    <div className="graph-scrim" aria-hidden="true"></div>
    <section className="graph-drawer">
      <header className="graph-drawer-header">
        <div>
          <strong><GitBranch size={14}/> Relationship graph</strong>
          <span>{linkSource ? `Linking from ${nodeLabel(state, linkSource)}` : groupedNodes ? `Bulk link group: ${groupedNodes.nodeNos.length} ${labels[groupedNodes.type].toLowerCase()}. Click one compatible node to link the whole bunch.` : overviewMode ? "Overview mode: fit view collapses nodes to colored outlines so the full graph stays visible." : "Drag empty space to box-select nodes, then drag selected nodes together. Middle/right drag pans. Ctrl+C copies selected nodes, Ctrl+V pastes, Delete removes selected nodes."}</span>
        </div>
        <div className="graph-actions">
          {groupedNodes && <button onClick={clearGroupedNodes}><X size={13}/> Cancel group</button>}
          {linkSource && <button onClick={onClearSource}><X size={13}/> Cancel link</button>}
          <button onClick={onClose}><X size={14}/></button>
        </div>
      </header>
    <div className={`graph-canvas${largeGraphMode ? " large-graph" : ""}${isGraphMoving ? " graph-moving" : ""}`} ref={canvasRef}>
      {!graph.nodes.length && <div className="graph-empty">Create or load nodes and they will appear here as a relationship map.</div>}
      {hasGraphRecords && <div className="graph-toolbar">
        <button type="button" onClick={zoomIn} aria-label="Zoom in"><Plus size={14}/></button>
        <button type="button" onClick={zoomOut} aria-label="Zoom out"><Minus size={14}/></button>
        <button type="button" onClick={arrangeByCategory}>Arrange</button>
        <button type="button" onClick={createGroupFromSelection} disabled={!groupableSelection || Boolean(linkSource) || Boolean(groupedNodes)}><Link2 size={14}/> Group selection</button>
      </div>}
      {hasGraphRecords && <div className="graph-filter-bar">
        {entityOrder.map((type) => <button key={type} type="button" className={filters[type] ? "active" : ""} onClick={() => toggleFilter(type)}>
          <span className={`graph-filter-dot ${type} ${filters[type] ? "active" : "inactive"}`}></span>
          {labels[type]}
        </button>)}
      </div>}
      {!!offscreen.top && <button className="graph-offscreen-indicator top" type="button" onClick={fitOverview}>{offscreen.top} offscreen above</button>}
      {!!offscreen.right && <button className="graph-offscreen-indicator right" type="button" onClick={fitOverview}>{offscreen.right} offscreen right</button>}
      {!!offscreen.bottom && <button className="graph-offscreen-indicator bottom" type="button" onClick={fitOverview}>{offscreen.bottom} offscreen below</button>}
      {!!offscreen.left && <button className="graph-offscreen-indicator left" type="button" onClick={fitOverview}>{offscreen.left} offscreen left</button>}
      <ReactFlow
        onInit={setFlowInstance}
        fitView={!initialViewport}
        defaultViewport={initialViewport || { x: 0, y: 0, zoom: 1 }}
        fitViewOptions={{ padding: 0.26, maxZoom: 0.72, duration: 0 }}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        minZoom={0.01}
        maxZoom={2.5}
        nodesDraggable={!graphInteractionLocked}
        nodesConnectable={false}
        elementsSelectable={!graphInteractionLocked}
        selectNodesOnDrag={!graphInteractionLocked}
        selectionOnDrag={!graphInteractionLocked}
        selectionMode={SelectionMode.Partial}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        deleteKeyCode={null}
        panOnDrag={[1, 2]}
        onlyRenderVisibleElements={!largeGraphMode || isGraphMoving}
        zoomOnScroll
        zoomOnPinch
        edgeTypes={edgeTypes}
        onMouseDownCapture={handleGraphMouseDownCapture}
        onMoveStart={() => setIsGraphMoving(true)}
        onNodeDragStart={() => setIsGraphMoving(true)}
        onNodeDragStop={(_, node, draggedNodes) => {
          setIsGraphMoving(false);
          onLayoutChange(layoutPatchFromNodes(draggedNodes.length ? draggedNodes : [node]));
        }}
        onSelectionDragStart={() => setIsGraphMoving(true)}
        onSelectionDragStop={(_, selectedNodes) => {
          setIsGraphMoving(false);
          onLayoutChange(layoutPatchFromNodes(selectedNodes));
        }}
        onNodeClick={(event, node) => {
          if (event.shiftKey && !groupedNodes) {
            addNodeToSelection(node.id);
            return;
          }
          if (!graphInteractionLocked) {
            setSelectedNodeIds(new Set([node.id]));
          }
          setOverviewMode(false);
          setSelectedEdge(null);
          const ref = parseGraphNode(node.id);
          if (!ref) return;
          if (groupedNodes) {
            if (ref.type === groupedNodes.type && groupedNodes.nodeNos.includes(ref.nodeNo)) return;
            onBulkLink(groupedNodes, ref);
            setGroupedNodes(null);
            return;
          }
          onNodeClick(ref);
        }}
        onEdgeClick={(event, edge) => {
          event.preventDefault();
          event.stopPropagation();
          setSelectedEdge(edge.data?.relationship || null);
        }}
        onPaneClick={() => {
          setSelectedEdge(null);
          onClearSource();
          setSelectedNodeIds(new Set());
        }}
        onMoveEnd={(_, nextViewport) => {
          setIsGraphMoving(false);
          setViewport(nextViewport);
          onViewportChange(nextViewport);
          if (nextViewport.zoom > 0.42) setOverviewMode(false);
        }}
      >
        <Background gap={24} size={1}/>
      </ReactFlow>
      {selectedEdge && <div className="graph-edge-card">
        <strong>{selectedEdge.label}</strong>
        <span>{nodeLabel(state, selectedEdge.source)} {"->"} {nodeLabel(state, selectedEdge.target)}</span>
        <div>
          <button onClick={() => setSelectedEdge(null)}>Keep</button>
          <button className="danger-button" onClick={() => { onRemoveRelationship(selectedEdge); setSelectedEdge(null); }}>Remove link</button>
        </div>
      </div>}
    </div>
    </section>
  </div>;
}

function renderMarkdown(markdown: string, state: AnnotationState, spanFocus: SpanFocus, onSpanClick: (event: React.MouseEvent, spans: AnnotatedSpan[], text: string) => void, selectionMenu: SelectionMenu) {
  const lines = markdown.split(/(\n)/);
  let offset = 0;
  const blocks: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i] || "";
    const newline = lines[i + 1] || "";
    const start = offset;
    offset += line.length + newline.length;
    if (!line.trim()) {
      blocks.push(<div className="md-space" key={start}/>);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^\s*-\s+(.*)$/);
    const tableRow = line.includes(" | ") && line.split(" | ").length >= 3;
    if (heading) blocks.push(<div className={`md-heading h${heading[1].length}`} key={start}>{renderInline(heading[2], start + heading[1].length + 1, state, spanFocus, onSpanClick, selectionMenu)}</div>);
    else if (bullet) blocks.push(<div className="md-bullet" key={start}><span>*</span><p>{renderInline(bullet[1], start + line.indexOf(bullet[1]), state, spanFocus, onSpanClick, selectionMenu)}</p></div>);
    else if (tableRow) blocks.push(<div className="md-table-row" key={start}>{renderInline(line, start, state, spanFocus, onSpanClick, selectionMenu)}</div>);
    else blocks.push(<p className="md-paragraph" key={start}>{renderInline(line, start, state, spanFocus, onSpanClick, selectionMenu)}</p>);
  }
  return blocks;
}

function renderInline(text: string, offset: number, state: AnnotationState, spanFocus: SpanFocus, onSpanClick: (event: React.MouseEvent, spans: AnnotatedSpan[], text: string) => void, selectionMenu: SelectionMenu) {
  const spans: HighlightSpan[] = [...collectHighlightSpans(state), ...(selectionMenu ? [{ field: "pending", text: selectionMenu.text, start: selectionMenu.start, end: selectionMenu.end, entityType: "pending", nodeNo: -1, index: -1, identity: false } as HighlightSpan] : [])]
    .filter((span) => typeof span.start === "number" && typeof span.end === "number")
    .filter((span) => span.end! > offset && span.start! < offset + text.length);
  const boundaries = Array.from(new Set([0, text.length, ...spans.flatMap((span) => [Math.max(0, span.start! - offset), Math.min(text.length, span.end! - offset)])])).sort((a, b) => a - b);
  const pieces: React.ReactNode[] = [];
  boundaries.slice(0, -1).forEach((localStart, index) => {
    const localEnd = boundaries[index + 1];
    if (localEnd <= localStart) return;
    const active = spans.filter((span) => span.start! <= offset + localStart && span.end! >= offset + localEnd);
    const value = text.slice(localStart, localEnd);
    if (!active.length) {
      pieces.push(<span key={`text-${offset}-${localStart}`} data-source-start={offset + localStart}>{value}</span>);
      return;
    }
    const annotated = active.filter(isAnnotatedSpan);
    const identitySpans = annotated.filter((span) => span.identity);
    const identitySpan = primaryIdentitySpan(identitySpans);
    const subfieldSpans = annotated.filter((span) => !span.identity || span !== identitySpan);
    const pending = active.some((span) => span.entityType === "pending");
    const focused = annotated.find((span) => spanFocus && spanMatchesFocus(span, spanFocus));
    const dataSpan = focused || annotated[0];
    const classes = [
      "highlight",
      pending ? "pending" : "",
      identitySpan ? `identity ${identitySpan.entityType}` : "",
      subfieldSpans.length ? "subfield" : "",
      annotated.length > 1 ? "overlap" : "",
      focused ? "selected-highlight" : ""
    ].filter(Boolean).join(" ");
    pieces.push(<mark
      key={`mark-${offset}-${localStart}-${localEnd}`}
      data-source-start={offset + localStart}
      data-selection-id={pending ? selectionMenu?.id : undefined}
      data-entity-type={dataSpan?.entityType}
      data-node-no={dataSpan?.nodeNo}
      data-span-index={dataSpan?.index}
      className={classes}
      style={highlightStyle(subfieldSpans)}
      onClick={(event) => {
        event.stopPropagation();
        if (annotated.length) onSpanClick(event, annotated, value);
      }}
    >{value}</mark>);
  });
  return pieces;
}

function collectHighlightSpans(state: AnnotationState): AnnotatedSpan[] {
  return (Object.keys(labels) as EntityType[]).flatMap((type) => (state[type] as AnyRecord[]).flatMap((record) => record.evidence_spans.map((span, index) => ({ ...span, entityType: type, nodeNo: record.node_no, index, identity: isMainEvidenceSpan(type, record, index) }))));
}

function isAnnotatedSpan(span: HighlightSpan): span is AnnotatedSpan {
  return span.entityType !== "pending";
}

function spanMatchesFocus(span: AnnotatedSpan, focus: NonNullable<SpanFocus>) {
  return span.entityType === focus.type && span.nodeNo === focus.nodeNo && span.index === focus.index;
}

function primaryIdentitySpan(spans: AnnotatedSpan[]) {
  if (!spans.length) return undefined;
  return [...spans].sort(compareHighlightPriority)[0];
}

function compareHighlightPriority(a: AnnotatedSpan, b: AnnotatedSpan) {
  return entityOrder.indexOf(a.entityType) - entityOrder.indexOf(b.entityType)
    || Number(!a.identity) - Number(!b.identity)
    || a.nodeNo - b.nodeNo
    || a.index - b.index;
}

function highlightStyle(spans: AnnotatedSpan[]): React.CSSProperties | undefined {
  if (!spans.length) return undefined;
  return { boxShadow: [...spans].sort(compareHighlightPriority).slice(0, 4).map((span, index) => `inset 0 -${2 + index * 3}px 0 ${underlineColor(span.entityType, index)}`).join(", ") };
}

function underlineColor(type: EntityType, index: number) {
  const alpha = Math.max(0.28, 0.62 - index * 0.1);
  const hex = colors[type].replace("#", "");
  const value = Number.parseInt(hex, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type NodeNumberMaps = Record<EntityType, Map<number, number>>;

function normalizeNodeNumbers(input: AnnotationState): { state: AnnotationState; maps: NodeNumberMaps } {
  input = normalizeSchemaFields(input);
  const maps: NodeNumberMaps = {
    substances: new Map(),
    compositions: new Map(),
    properties: new Map(),
    measurements: new Map()
  };
  const sorted = {
    substances: [...input.substances].sort((a, b) => compareRecordsByOffset("substances", a, b)),
    compositions: [...input.compositions].sort((a, b) => compareRecordsByOffset("compositions", a, b)),
    properties: [...input.properties].sort((a, b) => compareRecordsByOffset("properties", a, b)),
    measurements: [...input.measurements].sort((a, b) => compareRecordsByOffset("measurements", a, b))
  };

  let nextNo = 1;
  entityOrder.forEach((type) => {
    (sorted[type] as AnyRecord[]).forEach((record) => {
      maps[type].set(record.node_no, nextNo);
      nextNo += 1;
    });
  });

  const state: AnnotationState = {
    ...input,
    substances: sorted.substances.map((record) => ({ ...record, node_no: maps.substances.get(record.node_no) ?? record.node_no })),
    compositions: sorted.compositions.map((record) => ({
      ...record,
      node_no: maps.compositions.get(record.node_no) ?? record.node_no,
      constituents: record.constituents.map((entry) => normalizeConstituent({ ...entry, constituent_ref: remapTargetRef(entry.constituent_ref, maps) }))
    })),
    properties: sorted.properties.map((record) => ({
      ...record,
      node_no: maps.properties.get(record.node_no) ?? record.node_no,
      target_ref: record.target_ref > 0 ? remapTargetRef(record.target_ref, maps) : 0
    })),
    measurements: sorted.measurements.map((record) => ({
      ...record,
      node_no: maps.measurements.get(record.node_no) ?? record.node_no,
      property_ref: maps.properties.get(record.property_ref) ?? record.property_ref
    })),
    graph_layout: remapGraphLayout(input.graph_layout || {}, maps)
  };
  state.graph_layout = filterGraphLayout(state.graph_layout, state);
  return { state, maps };
}

function normalizeSchemaFields(input: AnnotationState): AnnotationState {
  const structuralBySubstance = new Map<number, { value?: string; spans: EvidenceSpan[] }>();
  const structuralByComposition = new Map<number, { value?: string; spans: EvidenceSpan[] }>();
  const substances = input.substances.map((record) => {
    const legacy = record as SubstanceRecord & { structural?: string; physical_form?: string };
    const { structural: _legacyStructural, ...cleaned } = legacy;
    return { ...cleaned, physical_form: nonEmpty(legacy.physical_form || legacy.structural || "-"), evidence_spans: normalizeEvidenceSpanRoles("substances", renameEvidenceField(legacy.evidence_spans || [], "structural", "physical_form")) } as SubstanceRecord;
  });
  const compositions = input.compositions.map((record) => {
    const legacy = record as CompositionRecord & { structural?: string; physical_form?: string };
    const { structural: _legacyStructural, ...cleaned } = legacy;
    return {
      ...cleaned,
      physical_form: nonEmpty(legacy.physical_form || legacy.structural || "-"),
      constituents: (legacy.constituents || []).map((entry) => normalizeConstituent(entry)),
      evidence_spans: normalizeEvidenceSpanRoles("compositions", renameEvidenceField(legacy.evidence_spans || [], "structural", "physical_form"))
    } as CompositionRecord;
  });
  const rawProperties: PropertyRecord[] = [];
  input.properties.forEach((rawRecord) => {
    const legacy = rawRecord as PropertyRecord & { structural?: string; target_ref?: number | number[] };
    const structural = nonEmpty(legacy.structural || "-");
    const structuralSpans = legacy.evidence_spans.filter((span) => span.field === "structural");
    const refs = targetRefs(legacy.target_ref);
    if (structural !== "-" || structuralSpans.length) {
      refs.forEach((ref) => {
        if (substances.some((substance) => substance.node_no === ref)) {
          const current = structuralBySubstance.get(ref) || { spans: [] };
          structuralBySubstance.set(ref, {
            value: current.value && current.value !== "-" ? current.value : structural,
            spans: [...current.spans, ...renameEvidenceField(structuralSpans, "structural", "physical_form")]
          });
        }
        if (compositions.some((composition) => composition.node_no === ref)) {
          const current = structuralByComposition.get(ref) || { spans: [] };
          structuralByComposition.set(ref, {
            value: current.value && current.value !== "-" ? current.value : structural,
            spans: [...current.spans, ...renameEvidenceField(structuralSpans, "structural", "physical_form")]
          });
        }
      });
    }
    const { structural: _legacyStructural, ...property } = legacy;
    const cleaned = { ...property, property_type: normalizePropertyType(property.property_type), evidence_spans: normalizeEvidenceSpanRoles("properties", legacy.evidence_spans.filter((span) => span.field !== "structural")) };
    if (!refs.length) rawProperties.push({ ...cleaned, target_ref: 0 } as PropertyRecord);
    refs.forEach((ref, index) => rawProperties.push({ ...cleaned, node_no: index === 0 ? cleaned.node_no : temporaryCloneNodeNo(cleaned.node_no, index), target_ref: ref } as PropertyRecord));
  });
  return {
    ...input,
    graph_layout: input.graph_layout || {},
    substances: substances.map((record) => {
      const migrated = structuralBySubstance.get(record.node_no);
      if (!migrated) return { ...record, evidence_spans: normalizeEvidenceSpanRoles("substances", record.evidence_spans) };
      const nextSpans = [...record.evidence_spans.filter((span) => span.field !== "physical_form"), ...migrated.spans];
      return { ...record, physical_form: record.physical_form !== "-" ? record.physical_form : migrated.value || "-", evidence_spans: normalizeEvidenceSpanRoles("substances", nextSpans) };
    }),
    compositions: compositions.map((record) => {
      const migrated = structuralByComposition.get(record.node_no);
      if (!migrated) return { ...record, evidence_spans: normalizeEvidenceSpanRoles("compositions", record.evidence_spans) };
      const nextSpans = [...record.evidence_spans.filter((span) => span.field !== "physical_form"), ...migrated.spans];
      return { ...record, physical_form: record.physical_form !== "-" ? record.physical_form : migrated.value || "-", evidence_spans: normalizeEvidenceSpanRoles("compositions", nextSpans) };
    }),
    properties: rawProperties,
    measurements: input.measurements.map((record) => ({ ...record, evidence_spans: normalizeEvidenceSpanRoles("measurements", record.evidence_spans) }))
  };
}

function compareRecordsByOffset(type: EntityType, a: AnyRecord, b: AnyRecord) {
  return recordOffset(type, a) - recordOffset(type, b) || a.node_no - b.node_no;
}

function recordOffset(type: EntityType, record: AnyRecord) {
  const identity = identityField(type);
  const identityStarts = finiteStarts(record.evidence_spans.filter((span) => span.field === identity));
  if (identityStarts.length) return Math.min(...identityStarts);
  const fallbackStarts = finiteStarts(record.evidence_spans);
  return fallbackStarts.length ? Math.min(...fallbackStarts) : Number.MAX_SAFE_INTEGER;
}

function normalizeEvidenceSpanRoles(type: EntityType, spans: EvidenceSpan[]) {
  const normalized = spans.map((span) => ({ ...span, ...(span.primary ? { primary: true } : {}) }));
  if (normalized.some((span) => span.primary)) return normalized;
  let primaryIndex = normalized.findIndex((span) => span.field === identityField(type));
  if (type === "measurements" && primaryIndex < 0) primaryIndex = normalized.findIndex((span) => span.field === "evidence_text");
  if (primaryIndex < 0) return normalized;
  return normalized.map((span, index) => index === primaryIndex ? { ...span, primary: true } : span);
}

function isMainEvidenceSpan(type: EntityType, record: AnyRecord, index: number) {
  const span = record.evidence_spans[index];
  if (!span) return false;
  if (span.primary) return true;
  return type !== "measurements" && span.field === identityField(type);
}

function finiteStarts(spans: EvidenceSpan[]) {
  return spans.map((span) => span.start).filter((start): start is number => typeof start === "number" && Number.isFinite(start));
}

function remapTargetRef(ref: number, maps: NodeNumberMaps) {
  return maps.compositions.get(ref) ?? maps.substances.get(ref) ?? ref;
}

function remapActiveRecord(active: ActiveRecord, maps: NodeNumberMaps): ActiveRecord {
  if (!active) return null;
  return { ...active, nodeNo: maps[active.type].get(active.nodeNo) ?? active.nodeNo };
}

function remapGraphRef(ref: GraphRef | null, maps: NodeNumberMaps): GraphRef | null {
  if (!ref) return null;
  return { ...ref, nodeNo: maps[ref.type].get(ref.nodeNo) ?? ref.nodeNo };
}

function remapSpanFocus(focus: SpanFocus, maps: NodeNumberMaps): SpanFocus {
  if (!focus) return null;
  return { ...focus, nodeNo: maps[focus.type].get(focus.nodeNo) ?? focus.nodeNo };
}

function remapGraphLayout(layout: GraphLayout, maps: NodeNumberMaps): GraphLayout {
  return Object.fromEntries(Object.entries(layout).flatMap(([id, position]) => {
    const ref = parseGraphNode(id);
    if (!ref) return [];
    const nodeNo = maps[ref.type].get(ref.nodeNo) ?? ref.nodeNo;
    return [[graphId({ type: ref.type, nodeNo }), position]];
  }));
}

function filterGraphLayout(layout: GraphLayout, state: AnnotationState): GraphLayout {
  const validIds = new Set(graphRefs(state).map(graphId));
  return Object.fromEntries(Object.entries(layout).filter(([id]) => validIds.has(id)));
}

function removeGraphLayoutNode(layout: GraphLayout, ref: GraphRef): GraphLayout {
  const next = { ...layout };
  delete next[graphId(ref)];
  return next;
}

function removeRecordsFromState(state: AnnotationState, refs: GraphRef[]) {
  if (!refs.length) return state;
  const grouped = refs.reduce((acc, ref) => {
    acc[ref.type].add(ref.nodeNo);
    return acc;
  }, {
    substances: new Set<number>(),
    compositions: new Set<number>(),
    properties: new Set<number>(),
    measurements: new Set<number>()
  } as Record<EntityType, Set<number>>);
  const removedNodeNos = new Set(refs.map((ref) => ref.nodeNo));
  return {
    ...state,
    substances: state.substances.filter((item) => !grouped.substances.has(item.node_no)),
    compositions: state.compositions
      .filter((item) => !grouped.compositions.has(item.node_no))
      .map((item) => ({ ...item, constituents: item.constituents.filter((entry) => !removedNodeNos.has(entry.constituent_ref)) })),
    properties: state.properties
      .filter((item) => !grouped.properties.has(item.node_no))
      .map((item) => ({ ...item, target_ref: removedNodeNos.has(item.target_ref) ? 0 : item.target_ref })),
    measurements: state.measurements
      .filter((item) => !grouped.measurements.has(item.node_no))
      .map((item) => removedNodeNos.has(item.property_ref) ? { ...item, property_ref: 0 } : item),
    graph_layout: Object.fromEntries(Object.entries(state.graph_layout || {}).filter(([id]) => {
      const ref = parseGraphNode(id);
      return !ref || !removedNodeNos.has(ref.nodeNo);
    }))
  };
}

function cloneGraphNodes(state: AnnotationState, refs: GraphRef[], step = 1) {
  const sortedRefs = [...refs].sort((a, b) => entityOrder.indexOf(a.type) - entityOrder.indexOf(b.type) || a.nodeNo - b.nodeNo);
  if (!sortedRefs.length) return { state, refs: [] as GraphRef[] };
  let nextNodeNoValue = nextNodeNoForState(state);
  const clonedRefs: GraphRef[] = [];
  const nextState: AnnotationState = {
    ...state,
    substances: [...state.substances],
    compositions: [...state.compositions],
    properties: [...state.properties],
    measurements: [...state.measurements],
    graph_layout: { ...(state.graph_layout || {}) }
  };
  const shift = 28 * Math.max(1, step);
  sortedRefs.forEach((ref) => {
    const tempNodeNo = nextNodeNoValue++;
    const cloned = cloneRecordForGraph(state, ref, tempNodeNo);
    if (!cloned) return;
    clonedRefs.push({ type: ref.type, nodeNo: tempNodeNo });
    if (ref.type === "substances") nextState.substances = [...nextState.substances, cloned as SubstanceRecord];
    else if (ref.type === "compositions") nextState.compositions = [...nextState.compositions, cloned as CompositionRecord];
    else if (ref.type === "properties") nextState.properties = [...nextState.properties, cloned as PropertyRecord];
    else nextState.measurements = [...nextState.measurements, cloned as MeasurementRecord];
    const originalPosition = (state.graph_layout || {})[graphId(ref)];
    if (originalPosition) nextState.graph_layout[graphId({ type: ref.type, nodeNo: tempNodeNo })] = { x: originalPosition.x + shift, y: originalPosition.y + shift };
  });
  return { state: nextState, refs: clonedRefs };
}

function cloneRecordForGraph(state: AnnotationState, ref: GraphRef, tempNodeNo: number) {
  const record = (state[ref.type] as AnyRecord[]).find((item) => item.node_no === ref.nodeNo);
  if (!record) return null;
  if (ref.type === "substances") return { ...(record as SubstanceRecord), node_no: tempNodeNo, evidence_spans: cloneEvidenceSpans(record.evidence_spans) };
  if (ref.type === "compositions") return {
    ...(record as CompositionRecord),
    node_no: tempNodeNo,
    constituents: (record as CompositionRecord).constituents.map((entry) => ({ ...entry })),
    evidence_spans: cloneEvidenceSpans(record.evidence_spans)
  };
  if (ref.type === "properties") return {
    ...(record as PropertyRecord),
    node_no: tempNodeNo,
    evidence_spans: cloneEvidenceSpans(record.evidence_spans)
  };
  return {
    ...(record as MeasurementRecord),
    node_no: tempNodeNo,
    value: [...(record as MeasurementRecord).value],
    unit: [...(record as MeasurementRecord).unit],
    measurement_conditions: (record as MeasurementRecord).measurement_conditions.map((condition) => ({
      ...condition,
      condition_value: [...condition.condition_value],
      condition_unit: [...condition.condition_unit]
    })),
    evidence_spans: cloneEvidenceSpans(record.evidence_spans)
  };
}

function cloneEvidenceSpans(spans: EvidenceSpan[]) {
  return spans.map((span) => ({ ...span }));
}

function nextNodeNoForState(state: AnnotationState) {
  return Math.max(0, ...nodeRecords(state).map((item) => item.node_no)) + 1;
}

function layoutPatchFromNodes(nodes: FlowNode[]): GraphLayout {
  return Object.fromEntries(nodes.filter((node) => parseGraphNode(node.id)).map((node) => [node.id, node.position]));
}

function applyGraphNodeSelection(nodes: FlowNode[], selectedIds: Set<string>): FlowNode[] {
  let next: FlowNode[] | null = null;
  nodes.forEach((node, index) => {
    const selected = selectedIds.has(node.id);
    if (node.selected === selected) return;
    if (!next) next = nodes.slice();
    next[index] = { ...node, selected };
  });
  return next || nodes;
}

function applyGraphMovementChanges(changes: NodeChange[], nodes: FlowNode[]): FlowNode[] {
  if (!changes.length) return nodes;
  if (!changes.every((change) => change.type === "position")) return applyNodeChanges(changes, nodes);
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  let next: FlowNode[] | null = null;
  changes.forEach((change) => {
    if (change.type !== "position" || !change.position) return;
    const index = indexById.get(change.id);
    if (index === undefined) return;
    const current = nodes[index];
    const draggingPatch = typeof change.dragging === "boolean" ? { dragging: change.dragging } : {};
    const nextPosition = change.position;
    const currentDragging = typeof change.dragging === "boolean" ? current.dragging === change.dragging : true;
    if (current.position.x === nextPosition.x && current.position.y === nextPosition.y && currentDragging) return;
    if (!next) next = nodes.slice();
    next[index] = { ...current, position: nextPosition, ...draggingPatch };
  });
  return next || nodes;
}

function countOffscreenNodes(nodes: FlowNode[], viewport: GraphViewport, canvasSize: { width: number; height: number }) {
  const counts = { left: 0, right: 0, top: 0, bottom: 0 };
  if (!canvasSize.width || !canvasSize.height) return counts;
  nodes.filter((node) => parseGraphNode(node.id)).forEach((node) => {
    const width = Number(node.width) || GRAPH_NODE_EXPANDED_WIDTH;
    const height = Number(node.height) || GRAPH_NODE_EXPANDED_HEIGHT;
    const left = node.position.x * viewport.zoom + viewport.x;
    const right = (node.position.x + width) * viewport.zoom + viewport.x;
    const top = node.position.y * viewport.zoom + viewport.y;
    const bottom = (node.position.y + height) * viewport.zoom + viewport.y;
    if (right < 0) counts.left += 1;
    else if (left > canvasSize.width) counts.right += 1;
    if (bottom < 0) counts.top += 1;
    else if (top > canvasSize.height) counts.bottom += 1;
  });
  return counts;
}

function autoArrangeGraphLayout(state: AnnotationState, filters?: GraphFilterState): GraphLayout {
  const layout: GraphLayout = {};
  const visibleTypes = entityOrder.filter((type) => !filters || filters[type]);
  const connectivity = buildGraphConnectivity(state, visibleTypes);
  const orders = Object.fromEntries(visibleTypes.map((type) => {
    const sorted = [...(state[type] as AnyRecord[])].sort((a, b) => autoArrangeRank(type, a, b, state));
    return [type, sorted];
  })) as Record<EntityType, AnyRecord[]>;
  const initialRank = new Map<string, number>();
  visibleTypes.forEach((type) => {
    orders[type].forEach((record, index) => initialRank.set(graphId({ type, nodeNo: record.node_no }), index));
  });
  for (let pass = 0; pass < 6; pass += 1) {
    const sweep = pass % 2 === 0 ? visibleTypes : [...visibleTypes].reverse();
    const nextOrders = { ...orders };
    sweep.forEach((type) => {
      nextOrders[type] = reorderLaneByConnectivity(type, orders, connectivity, initialRank, visibleTypes);
    });
    visibleTypes.forEach((type) => {
      orders[type] = nextOrders[type];
    });
  }
  visibleTypes.forEach((type) => {
    const sorted = orders[type];
    const yPositions = laneYPositions(sorted, connectivity.weightedDegree);
    sorted.forEach((record, index) => {
      layout[graphId({ type, nodeNo: record.node_no })] = {
        x: GRAPH_LANE_X[type] + 22,
        y: yPositions[index] ?? GRAPH_LANE_TOP + 52 + index * 118
      };
    });
  });
  return layout;
}

function placeMissingGraphNodes(state: AnnotationState, visibleTypes: EntityType[], arrangedLayout: GraphLayout, storedLayout: GraphLayout): GraphLayout {
  const layout: GraphLayout = { ...storedLayout };
  const nodeGap = GRAPH_NODE_EXPANDED_HEIGHT + 52;
  visibleTypes.forEach((type) => {
    const records = [...(state[type] as AnyRecord[])].sort((a, b) => a.node_no - b.node_no);
    const usedY = records.flatMap((record) => {
      const position = layout[graphId({ type, nodeNo: record.node_no })];
      return position ? [position.y] : [];
    });
    let cursor = usedY.length ? Math.max(...usedY) + nodeGap : GRAPH_LANE_TOP + 58;
    records.forEach((record) => {
      const id = graphId({ type, nodeNo: record.node_no });
      if (layout[id]) return;
      const arranged = arrangedLayout[id];
      const x = arranged?.x ?? GRAPH_LANE_X[type] + 22;
      while (usedY.some((y) => Math.abs(y - cursor) < nodeGap * 0.72)) cursor += nodeGap;
      layout[id] = { x, y: cursor };
      usedY.push(cursor);
      cursor += nodeGap;
    });
  });
  return layout;
}

function autoArrangeRank(type: EntityType, a: AnyRecord, b: AnyRecord, state: AnnotationState) {
  if (type === "properties") {
    const aKey = (a as PropertyRecord).target_ref || Number.MAX_SAFE_INTEGER;
    const bKey = (b as PropertyRecord).target_ref || Number.MAX_SAFE_INTEGER;
    return aKey - bKey || a.node_no - b.node_no;
  }
  if (type === "measurements") {
    const aMeasurement = a as MeasurementRecord;
    const bMeasurement = b as MeasurementRecord;
    return aMeasurement.property_ref - bMeasurement.property_ref || a.node_no - b.node_no;
  }
  return a.node_no - b.node_no;
}

function computeLaneHeight(state: AnnotationState, visibleTypes: EntityType[]) {
  const maxCount = Math.max(1, ...visibleTypes.map((type) => state[type].length));
  return Math.max(GRAPH_LANE_HEIGHT, 180 + maxCount * 150);
}

type GraphConnectivity = {
  adjacency: Map<string, Array<{ id: string; type: EntityType; weight: number }>>;
  weightedDegree: Map<string, number>;
};

function buildGraphConnectivity(state: AnnotationState, visibleTypes: EntityType[]): GraphConnectivity {
  const visibility = new Set<EntityType>(visibleTypes);
  const adjacency = new Map<string, Array<{ id: string; type: EntityType; weight: number }>>();
  const weightedDegree = new Map<string, number>();
  const addNeighbor = (source: GraphRef, target: GraphRef, weight: number) => {
    if (!visibility.has(source.type) || !visibility.has(target.type)) return;
    const sourceId = graphId(source);
    const targetId = graphId(target);
    const append = (fromId: string, toId: string, toType: EntityType) => {
      const existing = adjacency.get(fromId) || [];
      if (!existing.some((entry) => entry.id === toId)) adjacency.set(fromId, [...existing, { id: toId, type: toType, weight }]);
    };
    append(sourceId, targetId, target.type);
    append(targetId, sourceId, source.type);
    weightedDegree.set(sourceId, (weightedDegree.get(sourceId) || 0) + weight);
    weightedDegree.set(targetId, (weightedDegree.get(targetId) || 0) + weight);
  };
  state.compositions.forEach((composition) => composition.constituents.forEach((entry) => {
    const type = materialRefType(state, entry.constituent_ref);
    if (type) addNeighbor({ type, nodeNo: entry.constituent_ref }, { type: "compositions", nodeNo: composition.node_no }, 0.72);
  }));
  state.properties.forEach((property) => {
    const type = materialRefType(state, property.target_ref);
    if (type) addNeighbor({ type, nodeNo: property.target_ref }, { type: "properties", nodeNo: property.node_no }, 1);
  });
  state.measurements.forEach((measurement) => {
    if (measurement.property_ref) addNeighbor({ type: "properties", nodeNo: measurement.property_ref }, { type: "measurements", nodeNo: measurement.node_no }, 1.35);
  });
  return { adjacency, weightedDegree };
}

function reorderLaneByConnectivity(type: EntityType, orders: Record<EntityType, AnyRecord[]>, connectivity: GraphConnectivity, initialRank: Map<string, number>, visibleTypes: EntityType[]) {
  const current = orders[type] || [];
  if (current.length < 2) return current;
  const laneIndex = entityOrder.indexOf(type);
  const orderIndexMaps = new Map<EntityType, Map<string, number>>();
  visibleTypes.forEach((visibleType) => {
    orderIndexMaps.set(visibleType, new Map((orders[visibleType] || []).map((record, index) => [graphId({ type: visibleType, nodeNo: record.node_no }), index])));
  });
  const maxDegree = Math.max(1, ...current.map((record) => connectivity.weightedDegree.get(graphId({ type, nodeNo: record.node_no })) || 0));
  const centerIndex = (current.length - 1) / 2;
  return [...current].sort((a, b) => {
    const scoreA = laneOrderingScore(type, a, current.length, laneIndex, orders, orderIndexMaps, connectivity, initialRank, centerIndex, maxDegree);
    const scoreB = laneOrderingScore(type, b, current.length, laneIndex, orders, orderIndexMaps, connectivity, initialRank, centerIndex, maxDegree);
    const idA = graphId({ type, nodeNo: a.node_no });
    const idB = graphId({ type, nodeNo: b.node_no });
    return scoreA - scoreB
      || (connectivity.weightedDegree.get(idB) || 0) - (connectivity.weightedDegree.get(idA) || 0)
      || (initialRank.get(idA) ?? 0) - (initialRank.get(idB) ?? 0)
      || a.node_no - b.node_no;
  });
}

function laneOrderingScore(type: EntityType, record: AnyRecord, laneLength: number, laneIndex: number, orders: Record<EntityType, AnyRecord[]>, orderIndexMaps: Map<EntityType, Map<string, number>>, connectivity: GraphConnectivity, initialRank: Map<string, number>, centerIndex: number, maxDegree: number) {
  const id = graphId({ type, nodeNo: record.node_no });
  const neighbors = connectivity.adjacency.get(id) || [];
  const fallbackRank = initialRank.get(id) ?? 0;
  const fallbackPosition = normalizedLanePosition(fallbackRank, laneLength) * Math.max(1, laneLength - 1);
  const weightedTargets = neighbors.flatMap((neighbor) => {
    const neighborOrder = orders[neighbor.type] || [];
    const neighborIndex = orderIndexMaps.get(neighbor.type)?.get(neighbor.id);
    if (neighborIndex === undefined) return [];
    const neighborLaneIndex = entityOrder.indexOf(neighbor.type);
    const laneDistance = Math.max(1, Math.abs(laneIndex - neighborLaneIndex));
    return [{
      score: normalizedLanePosition(neighborIndex, neighborOrder.length) * Math.max(1, laneLength - 1),
      weight: neighbor.weight / laneDistance
    }];
  });
  const weightedScore = weightedTargets.reduce((sum, item) => sum + item.score * item.weight, 0);
  const totalWeight = weightedTargets.reduce((sum, item) => sum + item.weight, 0);
  const barycenter = totalWeight ? weightedScore / totalWeight : fallbackPosition;
  const degree = connectivity.weightedDegree.get(id) || 0;
  const degreeNorm = degree / maxDegree;
  const hubPull = totalWeight ? Math.min(0.42, 0.12 + degreeNorm * 0.3) : Math.min(0.18, degreeNorm * 0.18);
  const centeredScore = barycenter * (1 - hubPull) + centerIndex * hubPull;
  const edgeBias = totalWeight ? 0 : fallbackRank <= centerIndex ? -0.85 : 0.85;
  return centeredScore + edgeBias + fallbackPosition * 0.05 - degreeNorm * 0.08;
}

function normalizedLanePosition(index: number, length: number) {
  if (length <= 1) return 0.5;
  return index / (length - 1);
}

function laneYPositions(records: AnyRecord[], weightedDegree: Map<string, number>) {
  if (!records.length) return [];
  const gaps = records.map((record, index) => {
    if (index === 0) return 0;
    const prev = records[index - 1];
    const currentDegree = weightedDegree.get(graphIdForRecord(record)) || 0;
    const previousDegree = weightedDegree.get(graphIdForRecord(prev)) || 0;
    return 104 + Math.min(52, Math.max(currentDegree, previousDegree) * 9);
  });
  const totalSpan = gaps.reduce((sum, gap) => sum + gap, 0);
  const top = GRAPH_LANE_TOP + 52 + Math.max(0, (computeVirtualLaneHeight(records.length) - totalSpan) / 2);
  let cursor = top;
  return records.map((_, index) => {
    if (index === 0) return cursor;
    cursor += gaps[index];
    return cursor;
  });
}

function computeVirtualLaneHeight(count: number) {
  return Math.max(GRAPH_LANE_HEIGHT, 180 + count * 150);
}

function graphIdForRecord(record: AnyRecord) {
  if ("substance_name" in record) return graphId({ type: "substances", nodeNo: record.node_no });
  if ("composition_name" in record) return graphId({ type: "compositions", nodeNo: record.node_no });
  if ("property_name" in record) return graphId({ type: "properties", nodeNo: record.node_no });
  return graphId({ type: "measurements", nodeNo: record.node_no });
}

function buildFocusSet(edges: Edge[], focusRef: GraphRef) {
  const focusId = graphId(focusRef);
  const neighbors = new Set<string>([focusId]);
  edges.forEach((edge) => {
    if (edge.source === focusId) neighbors.add(edge.target);
    if (edge.target === focusId) neighbors.add(edge.source);
  });
  return neighbors;
}

function alphaColor(hex: string, alpha: number) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function prepareAnnotatedExportClone(root: HTMLElement, state: AnnotationState) {
  unwrapElements(root, ".highlight.pending");
  const spans = collectHighlightSpans(state).filter((span) => validSpanBounds(span)).sort(compareHighlightPriority);
  root.querySelectorAll(".selected-highlight").forEach((element) => element.classList.remove("selected-highlight"));
  root.querySelectorAll<HTMLElement>(".highlight").forEach((element) => {
    const start = Number(element.dataset.sourceStart);
    const length = element.textContent?.length || 0;
    const entries = Number.isFinite(start) && length > 0 ? exportEntriesForSegment(state, spans, start, start + length) : [];
    element.classList.remove("overlap");
    if (entries.length) {
      element.dataset.annotations = JSON.stringify(entries);
      element.dataset.annotationCount = String(entries.length);
      element.tabIndex = 0;
      element.setAttribute("aria-label", `${entries.length} annotation${entries.length === 1 ? "" : "s"} available`);
    }
    [...element.attributes].forEach((attribute) => {
      if (attribute.name.startsWith("data-") && attribute.name !== "data-annotations" && attribute.name !== "data-annotation-count") element.removeAttribute(attribute.name);
    });
  });
}

function validSpanBounds(span: EvidenceSpan) {
  return Number.isFinite(span.start) && Number.isFinite(span.end) && Number(span.end) > Number(span.start);
}

function exportEntriesForSegment(state: AnnotationState, spans: AnnotatedSpan[], start: number, end: number): ExportAnnotationEntry[] {
  const seen = new Set<string>();
  return spans
    .filter((span) => Number(span.start) <= start && Number(span.end) >= end)
    .map((span) => exportEntryForSpan(state, span))
    .filter((entry): entry is ExportAnnotationEntry => Boolean(entry))
    .filter((entry) => {
      const key = `${entry.type}:${entry.nodeNo}:${entry.field}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function exportEntryForSpan(state: AnnotationState, span: AnnotatedSpan): ExportAnnotationEntry | null {
  const record = (state[span.entityType] as AnyRecord[]).find((item) => item.node_no === span.nodeNo);
  if (!record) return null;
  return {
    type: span.entityType,
    nodeNo: span.nodeNo,
    nodeId: `${nodePrefix(span.entityType)}${span.nodeNo}`,
    category: singular(span.entityType),
    title: recordTitleText(span.entityType, record, state),
    field: titleCase(fieldDisplayName(span.field)),
    rows: exportRowsForRecord(span.entityType, record, state)
  };
}

function exportRowsForRecord(type: EntityType, record: AnyRecord, state: AnnotationState) {
  if (type === "substances") {
    const item = record as SubstanceRecord;
    return cleanExportRows([
      ["Name", item.substance_name],
      ["Type", item.substance_type],
      ["Manufacturer", item.manufacturer],
      ["Physical form", item.physical_form],
      ["Linked properties", linkedPropertiesSummary(state, item.node_no)]
    ]);
  }
  if (type === "compositions") {
    const item = record as CompositionRecord;
    return cleanExportRows([
      ["Name", item.composition_name],
      ["Type", item.composition_type],
      ["Physical form", item.physical_form],
      ["Constituents", compositionConstituentSummary(state, item)],
      ["Linked properties", linkedPropertiesSummary(state, item.node_no)]
    ]);
  }
  if (type === "properties") {
    const item = record as PropertyRecord;
    return cleanExportRows([
      ["Name", item.property_name],
      ["Type", item.property_type],
      ["Targets", propertyTargetsSummary(state, item)],
      ["Measurements", propertyMeasurementsSummary(state, item.node_no)]
    ]);
  }
  const item = record as MeasurementRecord;
  return cleanExportRows([
    ["Property", measurementPropertySummary(state, item)],
    ["Type", item.measurement_type],
    ["Comparator", item.comparator],
    ["Value", arrayToText(item.value)],
    ["Unit", prettyMeasurementUnit(arrayToText(item.unit))],
    ["Lower", scalarDisplay(item.lower_value)],
    ["Upper", scalarDisplay(item.upper_value)],
    ["Conditions", measurementConditionSummary(item)]
  ]);
}

function cleanExportRows(rows: Array<[string, string | number | null | undefined]>): Array<{ label: string; value: string }> {
  return rows.map(([label, value]) => ({ label, value: exportValue(value) }));
}

function exportValue(value: string | number | null | undefined) {
  const text = String(value ?? "").trim();
  return text || "-";
}

function linkedPropertiesSummary(state: AnnotationState, nodeNo: number) {
  const linked = propertiesLinkedToNode(state, nodeNo);
  return linked.length ? linked.map((property) => `P${property.node_no} ${property.property_name || "Property"}`).join("; ") : "-";
}

function compositionConstituentSummary(state: AnnotationState, item: CompositionRecord) {
  if (!item.constituents.length) return "-";
  return item.constituents.map((constituent) => {
    const name = lookupLinkedTargetName(state, constituent.constituent_ref);
    const amount = constituentAmountText(constituent);
    const status = exportValue(constituent.constituent_status);
    return [name, status !== "-" ? `status ${status}` : "", amount !== "-" ? `amount ${amount}` : ""].filter(Boolean).join(" | ");
  }).join("; ");
}

function propertyTargetsSummary(state: AnnotationState, item: PropertyRecord) {
  return item.target_ref > 0 ? lookupLinkedTargetName(state, item.target_ref) : "-";
}

function propertyMeasurementsSummary(state: AnnotationState, nodeNo: number) {
  const linked = state.measurements.filter((measurement) => measurement.property_ref === nodeNo);
  return linked.length ? linked.map((measurement) => `M${measurement.node_no} ${measurementDisplayText(measurement) || "Measurement"}`).join("; ") : "-";
}

function measurementPropertySummary(state: AnnotationState, item: MeasurementRecord) {
  const property = state.properties.find((record) => record.node_no === item.property_ref);
  return property ? `P${property.node_no} ${property.property_name || "Property"}` : "<Unlinked Property>";
}

function measurementConditionSummary(item: MeasurementRecord) {
  if (!item.measurement_conditions.length) return "-";
  return item.measurement_conditions.map((condition) => {
    const value = arrayToText(condition.condition_value);
    const unit = arrayToText(condition.condition_unit);
    return [condition.condition_name, value, unit].map(exportValue).filter((part) => part !== "-").join(" ");
  }).filter(Boolean).join("; ") || "-";
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function unwrapElements(root: HTMLElement, selector: string) {
  root.querySelectorAll(selector).forEach((element) => {
    const parent = element.parentNode;
    if (!parent) return;
    while (element.firstChild) parent.insertBefore(element.firstChild, element);
    parent.removeChild(element);
  });
}

function annotatedViewHtml({ title, documentId, workspacePath, status, counts, body }: {
  title: string;
  documentId: string;
  workspacePath: string;
  status: Status;
  counts: Record<EntityType, number>;
  body: string;
}) {
  const exportedAt = new Date().toLocaleString();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - Annotated View</title>
  <style>
    :root { color-scheme: light; --ink: #172033; --muted: #64748b; --line: #dbe3ee; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #eef3f8; color: var(--ink); font-family: Inter, Segoe UI, Arial, sans-serif; }
    .export-page { max-width: 1040px; margin: 0 auto; padding: 34px 34px 54px; }
    .export-header { margin-bottom: 22px; padding: 24px; border: 1px solid var(--line); border-radius: 18px; background: linear-gradient(135deg, #ffffff, #f8fbff); box-shadow: 0 18px 46px rgba(15,23,42,.08); }
    .export-header h1 { margin: 0 0 8px; font-size: 22px; line-height: 1.25; }
    .export-meta { display: grid; gap: 4px; color: var(--muted); font-size: 12px; }
    .export-counts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .export-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; border-radius: 999px; border: 1px solid var(--line); background: #fff; font-size: 12px; font-weight: 700; }
    .export-chip::before { content: ""; width: 9px; height: 9px; border-radius: 999px; background: currentColor; }
    .export-chip.substances { color: #15803d; }
    .export-chip.compositions { color: #0891b2; }
    .export-chip.properties { color: #9333ea; }
    .export-chip.measurements { color: #c2410c; }
    .export-legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; color: var(--muted); font-size: 12px; }
    .legend-sample { display: inline-flex; align-items: center; gap: 6px; }
    .legend-fill { width: 26px; height: 12px; border-radius: 4px; background: #bbf7d0; }
    .legend-line { width: 26px; height: 12px; border-bottom: 2px solid #9333ea; }
    .export-document { padding: 34px 38px 48px; border: 1px solid var(--line); border-radius: 18px; background: #fff; box-shadow: 0 22px 54px rgba(15,23,42,.10); }
    .document-view { line-height: 1.56; font-family: Georgia, 'Times New Roman', serif; font-size: 15px; background: #fff; color: #0f172a; }
    .md-space { height: 8px; }
    .md-heading { font-family: Inter, Segoe UI, Arial, sans-serif; color: #0f172a; margin: 18px 0 8px; font-weight: 760; }
    .md-heading.h1 { font-size: 22px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
    .md-heading.h2 { font-size: 18px; }
    .md-heading.h3, .md-heading.h4 { font-size: 14px; color: #334155; }
    .md-paragraph { margin: 6px 0; }
    .md-bullet { display: grid; grid-template-columns: 16px 1fr; gap: 4px; margin: 4px 0; }
    .md-bullet p { margin: 0; }
    .md-table-row { margin: 3px 0; padding: 6px 8px; overflow-x: auto; white-space: pre; border-left: 2px solid #cbd5e1; background: #f8fafc; font-family: Consolas, "SFMono-Regular", monospace; font-size: 12px; line-height: 1.4; color: #334155; }
    .highlight { position: relative; border-radius: 3px; padding: 1px 2px; background: transparent; }
    .highlight.identity.substances { background: #bbf7d0; }
    .highlight.identity.compositions { background: #c8f3fb; }
    .highlight.identity.properties { background: #e9d5ff; }
    .highlight.identity.measurements { background: #fed7aa; }
    .highlight.subfield:not(.identity) { background: transparent; }
    .highlight[data-annotations] { cursor: help; }
    .highlight[data-annotations]:focus { outline: 2px solid #0f172a; outline-offset: 2px; }
    .annotation-tooltip { position: fixed; left: 0; top: 0; z-index: 9999; width: min(380px, calc(100vw - 24px)); max-height: min(440px, calc(100vh - 24px)); overflow: auto; overscroll-behavior: auto; padding: 10px; border: 1px solid #cbd5e1; border-radius: 16px; background: rgba(255,255,255,.98); box-shadow: 0 24px 60px rgba(15,23,42,.18); pointer-events: none; opacity: 0; transform: translate3d(var(--tooltip-x, -9999px), var(--tooltip-y, -9999px), 0); transition: opacity .08s ease; will-change: transform, opacity; }
    .annotation-tooltip.visible { opacity: 1; pointer-events: auto; }
    .annotation-tooltip-title { margin: 0 0 8px; font-size: 12px; font-weight: 800; color: #475569; letter-spacing: .01em; }
    .annotation-card { display: grid; gap: 8px; padding: 10px; border: 1px solid #e2e8f0; border-left: 4px solid #94a3b8; border-radius: 13px; background: #fff; }
    .annotation-card + .annotation-card { margin-top: 8px; }
    .annotation-card.substances { border-left-color: #15803d; background: #fbfffc; }
    .annotation-card.compositions { border-left-color: #0891b2; background: #fbfdff; }
    .annotation-card.properties { border-left-color: #9333ea; background: #fdfbff; }
    .annotation-card.measurements { border-left-color: #c2410c; background: #fffdf9; }
    .annotation-card-header { display: flex; align-items: baseline; gap: 6px; min-width: 0; font-family: Inter, Segoe UI, Arial, sans-serif; }
    .annotation-node-id { flex: 0 0 auto; padding: 2px 7px; border-radius: 999px; background: #eef2f7; color: #0f172a; font-size: 11px; font-weight: 850; }
    .annotation-card-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #111827; font-size: 13px; font-weight: 850; }
    .annotation-field { display: inline-flex; width: fit-content; padding: 2px 7px; border-radius: 999px; background: #f8fafc; color: #64748b; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
    .annotation-row { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 8px; align-items: baseline; font-size: 12px; line-height: 1.35; }
    .annotation-row-label { color: #64748b; font-weight: 800; }
    .annotation-row-value { color: #1f2937; overflow-wrap: anywhere; }
    @media print {
      body { background: #fff; }
      .export-page { max-width: none; padding: 0; }
      .export-header, .export-document { box-shadow: none; border-radius: 0; }
      .annotation-tooltip { display: none; }
    }
  </style>
</head>
<body>
  <main class="export-page">
    <header class="export-header">
      <h1>${escapeHtml(title)}</h1>
      <div class="export-meta">
        <span>Document: ${escapeHtml(documentId)}</span>
        <span>Status: ${escapeHtml(status)}</span>
        ${workspacePath ? `<span>Folder: ${escapeHtml(workspacePath)}</span>` : ""}
        <span>Exported: ${escapeHtml(exportedAt)}</span>
      </div>
      <div class="export-counts">
        <span class="export-chip substances">Substances ${counts.substances}</span>
        <span class="export-chip compositions">Compositions ${counts.compositions}</span>
        <span class="export-chip properties">Properties ${counts.properties}</span>
        <span class="export-chip measurements">Measurements ${counts.measurements}</span>
      </div>
      <div class="export-legend">
        <span class="legend-sample"><span class="legend-fill"></span> parent node identity</span>
        <span class="legend-sample"><span class="legend-line"></span> annotated sub-field</span>
      </div>
    </header>
    <section class="export-document">
      <article class="document-view">
        ${body}
      </article>
    </section>
  </main>
  <div id="annotation-tooltip" class="annotation-tooltip" role="tooltip" aria-hidden="true"></div>
  <script>
    (function () {
      var tooltip = document.getElementById("annotation-tooltip");
      var active = null;
      var hideTimer = null;
      var positionFrame = null;
      var lastAnchor = null;
      if (!tooltip) return;

      function closestHighlight(target) {
        return target instanceof Element ? target.closest(".highlight[data-annotations]") : null;
      }

      function isInsideTooltip(target) {
        return target instanceof Node && tooltip.contains(target);
      }

      function readEntries(element) {
        try {
          var entries = JSON.parse(element.getAttribute("data-annotations") || "[]");
          return Array.isArray(entries) ? entries : [];
        } catch (error) {
          return [];
        }
      }

      function appendText(parent, className, text) {
        var child = document.createElement("span");
        child.className = className;
        child.textContent = text || "-";
        parent.appendChild(child);
        return child;
      }

      function renderTooltip(element) {
        var entries = readEntries(element);
        if (!entries.length) return hideTooltip();
        tooltip.textContent = "";
        tooltip.scrollTop = 0;
        var title = document.createElement("div");
        title.className = "annotation-tooltip-title";
        title.textContent = entries.length > 1 ? entries.length + " overlapping annotations" : "Annotation detail";
        tooltip.appendChild(title);
        entries.forEach(function (entry) {
          var card = document.createElement("section");
          card.className = "annotation-card " + (entry.type || "");
          var header = document.createElement("div");
          header.className = "annotation-card-header";
          appendText(header, "annotation-node-id", entry.nodeId);
          appendText(header, "annotation-card-title", entry.title || entry.category);
          card.appendChild(header);
          appendText(card, "annotation-field", (entry.category || "Annotation") + " - " + (entry.field || "Evidence"));
          (entry.rows || []).forEach(function (row) {
            var line = document.createElement("div");
            line.className = "annotation-row";
            appendText(line, "annotation-row-label", row.label);
            appendText(line, "annotation-row-value", row.value);
            card.appendChild(line);
          });
          tooltip.appendChild(card);
        });
        tooltip.classList.add("visible");
        tooltip.setAttribute("aria-hidden", "false");
        scheduleTooltipPosition(element);
      }

      function scheduleTooltipPosition(element) {
        if (element) lastAnchor = element;
        if (!lastAnchor || positionFrame) return;
        positionFrame = window.requestAnimationFrame(function () {
          positionFrame = null;
          if (!lastAnchor || !tooltip.classList.contains("visible")) return;
          placeTooltip(lastAnchor);
        });
      }

      function placeTooltip(element) {
        var margin = 12;
        var gap = 12;
        var anchor = element.getBoundingClientRect();
        var tooltipRect = tooltip.getBoundingClientRect();
        var viewportWidth = window.innerWidth;
        var viewportHeight = window.innerHeight;
        var spaceRight = viewportWidth - anchor.right - margin;
        var spaceLeft = anchor.left - margin;
        var spaceBelow = viewportHeight - anchor.bottom - margin;
        var spaceAbove = anchor.top - margin;
        var left = spaceRight >= tooltipRect.width + gap || spaceRight >= spaceLeft
          ? anchor.right + gap
          : anchor.left - tooltipRect.width - gap;
        var top = spaceBelow >= tooltipRect.height + gap || spaceBelow >= spaceAbove
          ? anchor.top
          : anchor.bottom - tooltipRect.height;
        left = Math.min(Math.max(margin, left), viewportWidth - tooltipRect.width - margin);
        top = Math.min(Math.max(margin, top), viewportHeight - tooltipRect.height - margin);
        tooltip.style.setProperty("--tooltip-x", Math.round(left) + "px");
        tooltip.style.setProperty("--tooltip-y", Math.round(top) + "px");
      }

      function hideTooltip() {
        cancelHide();
        if (positionFrame) {
          window.cancelAnimationFrame(positionFrame);
          positionFrame = null;
        }
        active = null;
        lastAnchor = null;
        tooltip.classList.remove("visible");
        tooltip.setAttribute("aria-hidden", "true");
      }

      function cancelHide() {
        if (!hideTimer) return;
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }

      function scheduleHide() {
        cancelHide();
        hideTimer = window.setTimeout(function () {
          hideTimer = null;
          if (!active) return;
          if (active.matches(":hover") || tooltip.matches(":hover")) return;
          hideTooltip();
        }, 450);
      }

      document.addEventListener("pointerover", function (event) {
        if (isInsideTooltip(event.target)) {
          cancelHide();
          return;
        }
        var target = closestHighlight(event.target);
        if (!target) return;
        cancelHide();
        active = target;
        renderTooltip(target);
      });

      document.addEventListener("pointerout", function (event) {
        if (!active) return;
        var next = event.relatedTarget;
        if (next instanceof Element && active.contains(next)) return;
        if (isInsideTooltip(next)) return;
        scheduleHide();
      });

      tooltip.addEventListener("pointerenter", function () {
        cancelHide();
      });

      tooltip.addEventListener("pointerleave", function (event) {
        var next = event.relatedTarget;
        if (active && next instanceof Element && active.contains(next)) return;
        scheduleHide();
      });

      document.addEventListener("focusin", function (event) {
        var target = closestHighlight(event.target);
        if (!target) return;
        active = target;
        cancelHide();
        renderTooltip(target);
      });

      document.addEventListener("focusout", function (event) {
        if (active && event.target === active) {
          window.setTimeout(function () {
            if (!tooltip.matches(":hover")) scheduleHide();
          }, 0);
        }
      });

      window.addEventListener("scroll", function () {
        if (active) scheduleTooltipPosition(active);
      }, true);

      window.addEventListener("resize", function () {
        if (active) scheduleTooltipPosition(active);
      });
    }());
  </script>
</body>
</html>`;
}

function downloadTextFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename(value: string) {
  return (value || "annotated_document").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "_").slice(0, 120);
}

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || "";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] || char));
}

function statesEqual(a: AnnotationState, b: AnnotationState) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function setsEqual<T>(a: Set<T>, b: Set<T>) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function makeEvidence(selection: NonNullable<SelectionMenu>, field = "evidence_text", primary = false): EvidenceSpan {
  return { field, text: selection.text, start: selection.start, end: selection.end, ...(primary ? { primary } : {}) };
}

function summarizeEvidenceText(spans: EvidenceSpan[]) {
  const values = spans.map((span) => span.text.trim()).filter((text) => text && text !== "-");
  return values.length ? Array.from(new Set(values)).join(" | ") : "-";
}

function sortEvidenceSpans(spans: EvidenceSpan[]) {
  return [...spans].sort((a, b) => evidenceSortValue(a.start) - evidenceSortValue(b.start) || evidenceSortValue(a.end) - evidenceSortValue(b.end) || a.field.localeCompare(b.field));
}

function evidenceSortValue(value: number | null | undefined) {
  return typeof value === "number" ? value : Number.MAX_SAFE_INTEGER;
}

function evidenceSpanIndex(spans: EvidenceSpan[], target: EvidenceSpan) {
  const index = spans.findIndex((span) => span.field === target.field && span.start === target.start && span.end === target.end && span.text === target.text);
  return index >= 0 ? index : 0;
}

function identityField(type: EntityType) {
  return ({ substances: "substance_name", compositions: "composition_name", properties: "property_name", measurements: "value" } as Record<EntityType, string>)[type];
}

function buildAnnotationPatch(record: AnyRecord, target: AnnotationTarget, selectedText: string): { field: string; patch: Record<string, unknown> } {
  const value = annotationValue(target, selectedText);
  if (target.field.startsWith("constituents.")) {
    const [, rawIndex, key] = target.field.split(".");
    const index = Number(rawIndex);
    const composition = record as CompositionRecord;
    return {
      field: target.field,
      patch: { constituents: composition.constituents.map((item, itemIndex) => itemIndex === index ? normalizeConstituent({ ...item, [key]: value }) : item) }
    };
  }
  if (target.field.startsWith("measurement_conditions.")) {
    const [, rawIndex, key] = target.field.split(".");
    const index = Number(rawIndex);
    const measurement = record as MeasurementRecord;
    return {
      field: target.field,
      patch: { measurement_conditions: measurement.measurement_conditions.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }
    };
  }
  return { field: target.field, patch: { [target.field]: value } };
}

function annotationTargetForField(type: EntityType, record: AnyRecord, field: string, state: AnnotationState): AnnotationTarget | null {
  if (field === "evidence_text") {
    return { field, label: "Evidence span", kind: "text" };
  }
  if (field === identityField(type)) {
    return {
      field,
      label: fieldDisplayName(field),
      kind: type === "measurements" ? "mixedArray" : "text"
    };
  }
  if (type === "substances" && (field === "manufacturer" || field === "physical_form")) {
    return { field, label: fieldDisplayName(field), kind: "text" };
  }
  if (type === "compositions") {
    if (field === "physical_form") return { field, label: fieldDisplayName(field), kind: "text" };
    if (field === "composition_type") return { field, label: "Composition type", kind: "text" };
    if (field.startsWith("constituents.")) {
      const [, rawIndex, key] = field.split(".");
      const index = Number(rawIndex);
      const item = (record as CompositionRecord).constituents[index];
      if (!item) return null;
      const linkedName = lookupLinkedTargetName(state, item.constituent_ref);
      if (key === "amount_value") return { field, label: `${linkedName} amount value`, kind: "text" };
      if (key === "amount_lower_value") return { field, label: `${linkedName} lower amount`, kind: "text" };
      if (key === "amount_upper_value") return { field, label: `${linkedName} upper amount`, kind: "text" };
      if (key === "amount_unit") return { field, label: `${linkedName} amount unit`, kind: "text" };
    }
    return null;
  }
  if (type === "measurements") {
    if (field === "value") return { field, label: "Value", kind: "mixedArray" };
    if (field === "unit") return { field, label: "Unit", kind: "stringArray" };
    if (field === "lower_value") return { field, label: "Lower value", kind: "text" };
    if (field === "upper_value") return { field, label: "Upper value", kind: "text" };
    if (field.startsWith("measurement_conditions.")) {
      const [, rawIndex, key] = field.split(".");
      const index = Number(rawIndex);
      const humanIndex = Number.isFinite(index) ? index + 1 : 1;
      if (key === "condition_name") return { field, label: `Condition ${humanIndex} name`, kind: "text" };
      if (key === "condition_value") return { field, label: `Condition ${humanIndex} value`, kind: "mixedArray" };
      if (key === "condition_unit") return { field, label: `Condition ${humanIndex} unit`, kind: "stringArray" };
    }
  }
  return null;
}

function normalizeMeasurementRecord(record: MeasurementRecord): MeasurementRecord {
  let value = normalizeMeasurementArray(record.value);
  let unit = normalizeStringArray(record.unit);
  let lower_value = normalizeMeasurementScalar(record.lower_value);
  let upper_value = normalizeMeasurementScalar(record.upper_value);
  const measurement_type = record.measurement_type;
  let comparator: Comparator = measurement_type === "qualitative" ? "-" : record.comparator;
  if (measurement_type === "qualitative") {
    comparator = "-";
    value = value.map((item) => String(item).trim()).filter(Boolean);
    unit = ["-"];
    lower_value = "-";
    upper_value = "-";
  } else if (comparator === "range") {
    lower_value = firstMeasurementScalar(lower_value);
    upper_value = firstMeasurementScalar(upper_value);
    value = [];
  } else {
    lower_value = "-";
    upper_value = "-";
  }
  return {
    ...record,
    measurement_type,
    comparator,
    value,
    unit: measurement_type === "qualitative" ? ["-"] : unit,
    lower_value,
    upper_value,
    measurement_conditions: record.measurement_conditions.map(normalizeMeasurementCondition)
  };
}

function normalizeMeasurementCondition(condition: MeasurementCondition): MeasurementCondition {
  return {
    condition_name: nonEmpty(condition.condition_name),
    condition_value: normalizeMeasurementArray(condition.condition_value),
    condition_unit: normalizeStringArray(condition.condition_unit)
  };
}

function measurementEvidenceText(record: MeasurementRecord) {
  const preferred = record.evidence_spans.find((span) => span.field === "value")?.text?.trim();
  if (preferred) return preferred;
  return record.evidence_spans.map((span) => span.text.trim()).find(Boolean) || "";
}

function inferMeasurementFromText(text: string): { measurement_type: MeasurementType; comparator: Comparator; value: Array<string | number>; lower_value: string | number; upper_value: string | number; unit: string[] } {
  const source = text.trim();
  const numbers = extractMeasurementNumbers(source);
  const unit = inferMeasurementUnit(source);
  if (!numbers.length) return { measurement_type: "qualitative", comparator: "-", value: source ? [source] : [], lower_value: "-", upper_value: "-", unit: source ? ["-"] : [] };
  if (/\bbetween\b/i.test(source) && /\band\b/i.test(source) || /\bfrom\b/i.test(source) && /\bto\b/i.test(source) || /\bto\b/i.test(source) || /-?\d+(?:\.\d+)?\s*(?:-|–|—)\s*-?\d+(?:\.\d+)?/.test(source)) {
    return { measurement_type: "quantitative", comparator: "range", value: [], lower_value: numbers[0] ?? "-", upper_value: numbers[1] ?? "-", unit };
  }
  if (/(?:~|\bapprox(?:\.|imately)?\b|\baround\b|\babout\b|\bca\.?\b)/i.test(source)) {
    return { measurement_type: "quantitative", comparator: "approx", value: [numbers[0]], lower_value: "-", upper_value: "-", unit };
  }
  if (/(?:>=|≥|\bat least\b|\bno less than\b|\bnot less than\b)/i.test(source)) {
    return { measurement_type: "quantitative", comparator: ">=", value: [numbers[0]], lower_value: "-", upper_value: "-", unit };
  }
  if (/(?:<=|≤|\bat most\b|\bno more than\b|\bnot more than\b)/i.test(source)) {
    return { measurement_type: "quantitative", comparator: "<=", value: [numbers[0]], lower_value: "-", upper_value: "-", unit };
  }
  if (/(?:>|greater than|more than|above|exceed)/i.test(source)) {
    return { measurement_type: "quantitative", comparator: ">", value: [numbers[0]], lower_value: "-", upper_value: "-", unit };
  }
  if (/(?:<|less than|below|under)/i.test(source)) {
    return { measurement_type: "quantitative", comparator: "<", value: [numbers[0]], lower_value: "-", upper_value: "-", unit };
  }
  return { measurement_type: "quantitative", comparator: "=", value: [numbers[0]], lower_value: "-", upper_value: "-", unit };
}

function extractMeasurementNumbers(text: string) {
  return [...text.matchAll(/(?<![A-Za-z])-?\d+(?:\.\d+)?(?![A-Za-z])/g)].map((match) => match[0]);
}

function inferMeasurementUnit(text: string) {
  const matches = [...text.matchAll(/-?\d+(?:\.\d+)?\s*([A-Za-z%°µμ/][A-Za-z0-9%°µμ/^-]*)/g)]
    .map((match) => match[1].replace(/[),.;:]+$/g, "").trim())
    .filter((item) => item && !/^(to|and)$/i.test(item));
  return matches.length ? [matches[0]] : [];
}

function inferComparatorFromMeasurementState(value: Array<string | number>, lower_value: string | number, upper_value: string | number): Comparator {
  if (isNumericMeasurementScalar(lower_value) && isNumericMeasurementScalar(upper_value)) return "range";
  if (hasNumericItems(value)) return "=";
  return "-";
}

function normalizeMeasurementArray(value: Array<string | number>) {
  return value.flatMap((item) => {
    if (typeof item === "number") return [item];
    const text = String(item).trim();
    if (!text || text === "-") return [];
    return text.includes("|") ? textToArray(text) : [normalizeMeasurementScalar(text)];
  }).filter((item) => !(typeof item === "string" && item === "-"));
}

function normalizeStringArray(value: string[]) {
  return value.flatMap((item) => String(item).split("|").map((part) => part.trim())).filter((item) => item && item !== "-");
}

function normalizeMeasurementScalar(value: string | number) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  if (!text || text === "-") return "-";
  return text;
}

function isNumericMeasurementScalar(value: string | number) {
  return typeof value === "number" || (typeof value === "string" && value.trim() !== "" && value.trim() !== "-" && Number.isFinite(Number(value)));
}

function hasNumericItems(value: Array<string | number>) {
  return value.some((item) => typeof item === "number" || (typeof item === "string" && Number.isFinite(Number(item))));
}

function firstMeasurementScalar(...values: Array<string | number | undefined>) {
  for (const value of values) {
    if (value === undefined) continue;
    const normalized = normalizeMeasurementScalar(value);
    if (normalized !== "-") return normalized;
  }
  return "-";
}

function annotationValue(target: AnnotationTarget, selectedText: string): string | string[] | Array<string | number> {
  const text = selectedText.trim() || "-";
  if (target.kind === "stringArray") return textToStringArray(text);
  if (target.kind === "mixedArray") return textToArray(text);
  return text;
}

function hasAnnotation(record: AnyRecord, field: string) {
  return record.evidence_spans.some((span) => span.field === field && typeof span.start === "number" && typeof span.end === "number");
}

function finalizeRecordDefaults(type: EntityType, record: AnyRecord): AnyRecord {
  if (type === "substances") {
    const item = record as SubstanceRecord;
    return { ...item, substance_name: nonEmpty(item.substance_name), physical_form: nonEmpty(item.physical_form), manufacturer: nonEmpty(item.manufacturer) };
  }
  if (type === "compositions") {
    const item = record as CompositionRecord;
    return {
      ...item,
      composition_name: nonEmpty(item.composition_name),
      composition_type: nonEmpty(item.composition_type),
      physical_form: nonEmpty(item.physical_form),
      constituents: item.constituents.map(normalizeConstituent)
    };
  }
  if (type === "properties") {
    const item = record as PropertyRecord;
    return { ...item, property_name: nonEmpty(item.property_name) };
  }
  const item = record as MeasurementRecord;
  return normalizeMeasurementRecord(item);
}

function nonEmpty(value: string | number | null | undefined) {
  const text = String(value ?? "").trim();
  return text ? text : "-";
}

function normalizePropertyType(value: PropertyType | "constitutive") {
  return value === "constitutive" ? "performance" : value;
}

function targetRefs(value: number | number[] | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map((item) => Number(item)).filter((item, index, list) => item > 0 && list.indexOf(item) === index);
}

function temporaryCloneNodeNo(base: number, index: number) {
  return Number.MAX_SAFE_INTEGER - Math.abs(base || 0) * 10 - index;
}

function renameEvidenceField(spans: EvidenceSpan[], from: string, to: string) {
  return spans.map((span) => span.field === from ? { ...span, field: to } : span);
}

function defaultConstituent(nodeNo: number): ConstituentRecord {
  return {
    constituent_ref: nodeNo,
    constituent_status: "included",
    amount_comparator: "-",
    amount_value: "-",
    amount_unit: "-",
    amount_lower_value: "-",
    amount_upper_value: "-",
    function: "-",
    key_constituent: "-",
    key_reason: "-"
  };
}

function normalizeAmountScalar(value: string | number) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  if (!text || text === "-") return "-";
  const asNumber = Number(text);
  return Number.isFinite(asNumber) ? text : "-";
}

function normalizeConstituent(entry: Partial<ConstituentRecord> & { constituent_ref: number; constituent_type?: string }): ConstituentRecord {
  const next: ConstituentRecord = {
    ...defaultConstituent(entry.constituent_ref),
    ...entry,
    constituent_ref: Number(entry.constituent_ref) || 0,
    constituent_status: (entry.constituent_status || "included") as ConstituentStatus,
    amount_comparator: (entry.amount_comparator || "-") as AmountComparator,
    amount_unit: nonEmpty(entry.amount_unit),
    function: nonEmpty(entry.function),
    key_constituent: (entry.key_constituent || "-") as KeyConstituent,
    key_reason: nonEmpty(entry.key_reason)
  };
  if (next.constituent_status === "-") next.constituent_status = "included";
  if (next.constituent_status === "excluded") {
    next.amount_comparator = "-";
    next.amount_value = "-";
    next.amount_unit = "-";
    next.amount_lower_value = "-";
    next.amount_upper_value = "-";
  } else if (next.amount_comparator === "range") {
    next.amount_value = "-";
    next.amount_lower_value = normalizeAmountScalar(next.amount_lower_value);
    next.amount_upper_value = normalizeAmountScalar(next.amount_upper_value);
  } else if (next.amount_comparator === "balance") {
    next.amount_value = "-";
    next.amount_lower_value = "-";
    next.amount_upper_value = "-";
  } else if (next.amount_comparator === "-") {
    next.amount_value = "-";
    next.amount_lower_value = "-";
    next.amount_upper_value = "-";
  } else {
    next.amount_value = normalizeAmountScalar(next.amount_value);
    next.amount_lower_value = "-";
    next.amount_upper_value = "-";
  }
  if (next.key_constituent !== "yes") next.key_reason = "-";
  return next;
}

function constituentAmountText(item: ConstituentRecord) {
  const unit = item.amount_unit && item.amount_unit !== "-" ? ` ${item.amount_unit}` : "";
  if (item.amount_comparator === "range") {
    const lower = nonEmpty(item.amount_lower_value);
    const upper = nonEmpty(item.amount_upper_value);
    return lower !== "-" || upper !== "-" ? `${lower}-${upper}${unit}` : "-";
  }
  if (item.amount_comparator === "balance") return `balance${unit}`.trim();
  if (item.amount_comparator === "-") return "-";
  const value = nonEmpty(item.amount_value);
  return value === "-" ? "-" : `${item.amount_comparator} ${value}${unit}`.trim();
}

function nonEmptyArray<T extends string | number>(value: T[]) {
  return value.length ? value : ["-"];
}

function fieldDisplayName(field: string) {
  if (field === "evidence_text") return "Evidence span";
  const parts = field.split(".");
  const last = parts[parts.length - 1] || field;
  return last.replace(/_/g, " ");
}

function propertiesLinkedToNode(state: AnnotationState, nodeNo: number) {
  return state.properties.filter((property) => property.target_ref === nodeNo);
}

function relationshipFilterDefinitions(type: EntityType): Array<{ key: NodeRelationshipFilterKey; label: string }> {
  if (type === "compositions") return [{ key: "default", label: "No constituents" }];
  if (type === "properties") return [
    { key: "measurementUnlinked", label: "Measurement unlinked" },
    { key: "targetUnlinked", label: "Sub/ comp unlinked" },
  ];
  if (type === "measurements") return [{ key: "default", label: "Unlinked only" }];
  return [];
}

function recordMatchesRelationshipFilters(type: EntityType, record: AnyRecord, state: AnnotationState, filters: Partial<Record<NodeRelationshipFilterKey, boolean>>) {
  if (type === "compositions" && filters.default) return !(record as CompositionRecord).constituents.length;
  if (type === "measurements" && filters.default) return isUnlinkedNode(type, record, state);
  if (type === "properties") {
    const property = record as PropertyRecord;
    if (filters.measurementUnlinked && hasMeasurementLinkedToProperty(state, property.node_no)) return false;
    if (filters.targetUnlinked && property.target_ref > 0) return false;
  }
  return true;
}

function hasMeasurementLinkedToProperty(state: AnnotationState, propertyNo: number) {
  return state.measurements.some((measurement) => measurement.property_ref === propertyNo);
}

function isUnlinkedNode(type: EntityType, record: AnyRecord, state: AnnotationState) {
  if (type === "properties") {
    const property = record as PropertyRecord;
    return property.target_ref <= 0 && !hasMeasurementLinkedToProperty(state, property.node_no);
  }
  if (type === "measurements") return !(record as MeasurementRecord).property_ref;
  return false;
}

function compositionConstituentCandidates(state: AnnotationState, record: CompositionRecord): LinkCandidate[] {
  const linked = new Set(record.constituents.map((entry) => entry.constituent_ref));
  const substanceCandidates = state.substances
    .filter((item) => !linked.has(item.node_no))
    .map((item) => ({
      type: "substances" as EntityType,
      nodeNo: item.node_no,
      title: recordTitleText("substances", item, state),
      meta: item.substance_type
    }));
  const compositionCandidates = state.compositions
    .filter((item) => item.node_no !== record.node_no)
    .filter((item) => !linked.has(item.node_no))
    .filter((item) => !wouldCreateCompositionCycle(state, item.node_no, record.node_no))
    .map((item) => ({
      type: "compositions" as EntityType,
      nodeNo: item.node_no,
      title: recordTitleText("compositions", item, state),
      meta: item.composition_type || "-"
    }));
  return [...substanceCandidates, ...compositionCandidates].sort(compareLinkCandidates);
}

function propertyTargetCandidates(state: AnnotationState, record: PropertyRecord): LinkCandidate[] {
  return [
    ...state.substances
      .filter((item) => item.node_no !== record.target_ref)
      .map((item) => ({
        type: "substances" as EntityType,
        nodeNo: item.node_no,
        title: recordTitleText("substances", item, state),
        meta: item.substance_type
      })),
    ...state.compositions
      .filter((item) => item.node_no !== record.target_ref)
      .map((item) => ({
        type: "compositions" as EntityType,
        nodeNo: item.node_no,
        title: recordTitleText("compositions", item, state),
        meta: item.composition_type || "-"
      }))
  ].sort(compareLinkCandidates);
}

function measurementPropertyCandidates(state: AnnotationState, record: MeasurementRecord): LinkCandidate[] {
  return state.properties
    .filter((item) => item.node_no !== record.property_ref)
    .map((item) => ({
      type: "properties" as EntityType,
      nodeNo: item.node_no,
      title: recordTitleText("properties", item, state),
      meta: item.property_type
    }))
    .sort(compareLinkCandidates);
}

function compareLinkCandidates(a: LinkCandidate, b: LinkCandidate) {
  return entityOrder.indexOf(a.type) - entityOrder.indexOf(b.type) || a.nodeNo - b.nodeNo;
}

function wouldCreateCompositionCycle(state: AnnotationState, constituentNo: number, compositionNo: number) {
  return constituentNo === compositionNo || compositionCanReachComposition(state, constituentNo, compositionNo, new Set());
}

function compositionCanReachComposition(state: AnnotationState, sourceNo: number, targetNo: number, seen: Set<number>): boolean {
  if (seen.has(sourceNo)) return false;
  seen.add(sourceNo);
  const source = state.compositions.find((item) => item.node_no === sourceNo);
  if (!source) return false;
  return source.constituents.some((entry) => {
    if (materialRefType(state, entry.constituent_ref) !== "compositions") return false;
    if (entry.constituent_ref === targetNo) return true;
    return compositionCanReachComposition(state, entry.constituent_ref, targetNo, seen);
  });
}

function selectionOffsets(markdown: string, range: Range, selectedText: string) {
  const start = sourceOffsetFromRangePoint(range.startContainer, range.startOffset);
  const end = sourceOffsetFromRangePoint(range.endContainer, range.endOffset);
  if (start != null && end != null && start !== end) {
    const orderedStart = Math.min(start, end);
    const orderedEnd = Math.max(start, end);
    return { text: markdown.slice(orderedStart, orderedEnd), start: orderedStart, end: orderedEnd };
  }
  const candidate = selectedText.trim();
  const fallbackStart = markdown.indexOf(candidate);
  if (fallbackStart < 0) return null;
  return { text: candidate, start: fallbackStart, end: fallbackStart + candidate.length };
}

function sourceOffsetFromRangePoint(node: globalThis.Node, nodeOffset: number): number | null {
  const element = node.nodeType === globalThis.Node.TEXT_NODE ? node.parentElement : node as Element;
  const sourceElement = element?.closest?.("[data-source-start]") as HTMLElement | null;
  if (!sourceElement) return null;
  const sourceStart = Number(sourceElement.dataset.sourceStart);
  if (!Number.isFinite(sourceStart)) return null;
  if (node.nodeType === globalThis.Node.TEXT_NODE) return sourceStart + nodeOffset;
  const textBefore = Array.from(sourceElement.childNodes).slice(0, nodeOffset).map((child) => child.textContent || "").join("");
  return sourceStart + textBefore.length;
}

function selectionNodeElement(node: globalThis.Node): HTMLElement | null {
  if (node.nodeType === globalThis.Node.ELEMENT_NODE) return node as HTMLElement;
  return node.parentElement;
}

function addRelationship(state: AnnotationState, source: GraphRef, target: GraphRef): AnnotationState {
  const mode = relationshipMode(source, target);
  if (!mode || hasRelationship(state, source, target, mode)) return state;
  if (mode === "constituent") {
    return {
      ...state,
      compositions: state.compositions.map((item) => item.node_no === target.nodeNo ? {
        ...item,
        constituents: [...item.constituents, defaultConstituent(source.nodeNo)]
      } : item)
    };
  }
  if (mode === "target") {
    return { ...state, properties: state.properties.map((item) => item.node_no === target.nodeNo ? { ...item, target_ref: source.nodeNo } : item) };
  }
  if (mode === "measures") {
    return { ...state, measurements: state.measurements.map((item) => item.node_no === target.nodeNo ? { ...item, property_ref: source.nodeNo } : item) };
  }
  return state;
}

function relationshipMode(source: GraphRef, target: GraphRef) {
  if ((source.type === "substances" || source.type === "compositions") && target.type === "compositions") return "constituent" as const;
  if ((source.type === "substances" || source.type === "compositions") && target.type === "properties") return "target" as const;
  if (source.type === "properties" && target.type === "measurements") return "measures" as const;
  return null;
}

function hasRelationship(state: AnnotationState, source: GraphRef, target: GraphRef, mode: ReturnType<typeof relationshipMode>) {
  if (!mode) return false;
  if (mode === "constituent") {
    const composition = state.compositions.find((item) => item.node_no === target.nodeNo);
    if (!composition) return false;
    return composition.constituents.some((entry) => entry.constituent_ref === source.nodeNo);
  }
  if (mode === "target") {
    const property = state.properties.find((item) => item.node_no === target.nodeNo);
    return property?.target_ref === source.nodeNo;
  }
  if (mode === "measures") {
    const measurement = state.measurements.find((item) => item.node_no === target.nodeNo);
    return measurement?.property_ref === source.nodeNo;
  }
  return false;
}

function addBulkRelationships(state: AnnotationState, group: GraphNodeGroup, ref: GraphRef) {
  const members = group.nodeNos.map((nodeNo) => ({ type: group.type, nodeNo } as GraphRef));
  const forwardPairs = members.map((member) => ({ source: ref, target: member })).filter(({ source, target }) => source.nodeNo !== target.nodeNo || source.type !== target.type);
  const reversePairs = members.map((member) => ({ source: member, target: ref })).filter(({ source, target }) => source.nodeNo !== target.nodeNo || source.type !== target.type);
  const forwardValid = forwardPairs.length > 0 && forwardPairs.every(({ source, target }) => Boolean(relationshipMode(source, target)));
  const reverseValid = reversePairs.length > 0 && reversePairs.every(({ source, target }) => Boolean(relationshipMode(source, target)));
  const pairs = forwardValid ? forwardPairs : reverseValid ? reversePairs : [];
  if (!pairs.length) {
    return {
      state,
      applied: false,
      message: `That bulk link is not supported. Use a compatible node with ${labels[group.type].toLowerCase()}.`
    };
  }
  let nextState = state;
  let appliedCount = 0;
  pairs.forEach(({ source, target }) => {
    const updated = addRelationship(nextState, source, target);
    if (updated !== nextState) {
      nextState = updated;
      appliedCount += 1;
    }
  });
  if (!appliedCount) {
    return {
      state,
      applied: false,
      message: "Those links already exist, so there was nothing new to add."
    };
  }
  return {
    state: nextState,
    applied: true,
    message: `Linked ${appliedCount} ${appliedCount === 1 ? "relationship" : "relationships"} between ${nodeLabel(state, ref)} and the selected ${labels[group.type].toLowerCase()}.`
  };
}

function buildGraph(state: AnnotationState, linkSource: GraphRef | null, groupedNodes: GraphNodeGroup | null, overviewMode: boolean, filters: GraphFilterState, focusRef: GraphRef | null): { nodes: FlowNode[]; edges: Edge[] } {
  const nodes: FlowNode[] = [];
  const rawEdges: Edge[] = [];
  const visibleTypes = entityOrder.filter((type) => filters[type]);
  const visibleEntityCount = visibleTypes.reduce((sum, type) => sum + state[type].length, 0);
  if (!visibleEntityCount) return { nodes: [], edges: [] };
  const storedLayout = state.graph_layout || {};
  const requiredNodeIds = visibleTypes.flatMap((type) => (state[type] as AnyRecord[]).map((record) => graphId({ type, nodeNo: record.node_no })));
  const needsAutoArrange = requiredNodeIds.some((id) => !(id in storedLayout));
  const arrangedLayout = needsAutoArrange ? autoArrangeGraphLayout(state, filters) : {};
  const layout = needsAutoArrange ? placeMissingGraphNodes(state, visibleTypes, arrangedLayout, storedLayout) : storedLayout;
  state.compositions.forEach((composition) => composition.constituents.forEach((entry) => {
    const sourceId = graphIdForTarget(state, entry.constituent_ref);
    if (sourceId) rawEdges.push(makeEdge(sourceId, `c-${composition.node_no}`, "constituent"));
  }));
  state.properties.forEach((property) => {
    const sourceId = graphIdForTarget(state, property.target_ref);
    if (sourceId) rawEdges.push(makeEdge(sourceId, `p-${property.node_no}`, "target"));
  });
  state.measurements.forEach((measurement) => { if (measurement.property_ref) rawEdges.push(makeEdge(`p-${measurement.property_ref}`, `m-${measurement.node_no}`, "measures")); });
  const visibleEdges = applyEdgeRouting(rawEdges.filter((edge) => edge.source && edge.target).filter((edge) => {
    const source = parseGraphNode(edge.source);
    const target = parseGraphNode(edge.target);
    return Boolean(source && target && filters[source.type] && filters[target.type]);
  }));
  const focusSet = focusRef ? buildFocusSet(visibleEdges, focusRef) : null;
  const laneHeight = computeLaneHeight(state, visibleTypes);
  visibleTypes.forEach((type) => nodes.push(makeLaneNode(type, laneHeight)));
  visibleTypes.forEach((type) => {
    (state[type] as AnyRecord[]).forEach((record) => {
      const ref = { type, nodeNo: record.node_no };
      const id = graphId(ref);
      const muted = Boolean(focusSet && !focusSet.has(id));
      nodes.push(makeNode(type, record, layout[id] || arrangedLayout[id] || { x: GRAPH_LANE_X[type] + 28, y: GRAPH_LANE_TOP + 58 }, linkSource, groupedNodes, state, overviewMode, muted, focusRef?.type === type && focusRef?.nodeNo === record.node_no));
    });
  });
  const focusedEdges = focusSet ? visibleEdges.map((edge) => {
    const sourceFocused = focusSet.has(edge.source);
    const targetFocused = focusSet.has(edge.target);
    return sourceFocused && targetFocused ? edge : { ...edge, style: { ...(edge.style || {}), opacity: 0.1 } };
  }) : visibleEdges;
  return { nodes, edges: focusedEdges };
}

function makeNode(type: EntityType, record: AnyRecord, position: { x: number; y: number }, linkSource: GraphRef | null, groupedNodes: GraphNodeGroup | null, state: AnnotationState, overviewMode: boolean, muted = false, focused = false): FlowNode {
  const selected = linkSource?.type === type && linkSource.nodeNo === record.node_no;
  const grouped = groupedNodes?.type === type && groupedNodes.nodeNos.includes(record.node_no);
  const borderColor = selected || grouped ? "#0f172a" : colors[type];
  const width = overviewMode ? GRAPH_NODE_OVERVIEW_WIDTH : GRAPH_NODE_EXPANDED_WIDTH;
  const height = overviewMode ? GRAPH_NODE_OVERVIEW_HEIGHT : GRAPH_NODE_EXPANDED_HEIGHT;
  return {
    id: graphId({ type, nodeNo: record.node_no }),
    position,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: { label: `${nodePrefix(type)}${record.node_no}: ${recordTitleText(type, record, state)}` },
    width,
    height,
    style: {
      border: `2px solid ${borderColor}`,
      borderRadius: 999,
      width,
      height,
      padding: overviewMode ? "0" : "8px 18px",
      background: selected ? "#f8fafc" : grouped ? "#f1f5f9" : "#fff",
      color: overviewMode ? "transparent" : "#172033",
      fontSize: overviewMode ? 0 : 12,
      lineHeight: overviewMode ? 0 : 1.2,
      fontWeight: 700,
      textAlign: "center",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      whiteSpace: overviewMode ? "nowrap" : "normal",
      boxShadow: selected || grouped || focused ? "0 0 0 3px rgba(15,23,42,.14)" : "none",
      opacity: muted ? 0.18 : 1
    }
  };
}

function makeLaneNode(type: EntityType, laneHeight: number): FlowNode {
  return {
    id: `lane-${type}`,
    className: "graph-lane-node",
    position: { x: GRAPH_LANE_X[type], y: GRAPH_LANE_TOP },
    draggable: false,
    selectable: false,
    focusable: false,
    connectable: false,
    data: { label: labels[type] },
    style: {
      width: GRAPH_LANE_WIDTH,
      height: laneHeight,
      padding: "14px 16px",
      borderRadius: 22,
      border: `1px dashed ${alphaColor(colors[type], 0.34)}`,
      background: alphaColor(colors[type], 0.05),
      color: alphaColor(colors[type], 0.94),
      fontSize: 12,
      fontWeight: 800,
      boxShadow: "none",
      pointerEvents: "none"
    }
  };
}

function makeEdge(source: string, target: string, label: string): Edge {
  const relationship = relationshipFromEdge(source, target, label);
  return { id: `${source}-${target}-${label}`, source, target, data: { relationship }, type: "flexible", markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor(label) }, style: { stroke: edgeColor(label), strokeWidth: 2.6, opacity: 0.8 }, zIndex: 1 };
}

function applyEdgeRouting(edges: Edge[]): Edge[] {
  const bySource = new Map<string, Edge[]>();
  const byTarget = new Map<string, Edge[]>();
  edges.forEach((edge) => {
    bySource.set(edge.source, [...(bySource.get(edge.source) || []), edge]);
    byTarget.set(edge.target, [...(byTarget.get(edge.target) || []), edge]);
  });
  return edges.map((edge) => {
    const sourceGroup = bySource.get(edge.source) || [edge];
    const targetGroup = byTarget.get(edge.target) || [edge];
    const sourceIndex = sourceGroup.findIndex((item) => item.id === edge.id);
    const targetIndex = targetGroup.findIndex((item) => item.id === edge.id);
    const sourceOffset = (sourceIndex - (sourceGroup.length - 1) / 2) * 34;
    const targetOffset = (targetIndex - (targetGroup.length - 1) / 2) * 18;
    const sourceAnchorOffset = clampNumber((sourceIndex - (sourceGroup.length - 1) / 2) * 5, -22, 22);
    const targetAnchorOffset = clampNumber((targetIndex - (targetGroup.length - 1) / 2) * 5, -22, 22);
    return {
      ...edge,
      data: {
        ...(edge.data || {}),
        siblingOffset: sourceOffset + targetOffset,
        sourceAnchorOffset,
        targetAnchorOffset
      }
    };
  });
}

function edgeColor(label: string) {
  if (label === "constituent") return "#2563eb";
  if (label === "measures") return "#ea580c";
  return "#16a34a";
}

function relationshipFromEdge(source: string, target: string, label: string): RelationshipEdge | null {
  const sourceRef = parseGraphNode(source);
  const targetRef = parseGraphNode(target);
  return sourceRef && targetRef ? { id: `${source}-${target}-${label}`, source: sourceRef, target: targetRef, label } : null;
}

function removeRelationship(state: AnnotationState, edge: RelationshipEdge): AnnotationState {
  if (edge.label === "constituent" && edge.target.type === "compositions" && (edge.source.type === "substances" || edge.source.type === "compositions")) {
    return {
      ...state,
      compositions: state.compositions.map((item) => item.node_no === edge.target.nodeNo ? {
        ...item,
        constituents: item.constituents.filter((entry) => entry.constituent_ref !== edge.source.nodeNo)
      } : item)
    };
  }
  if (edge.label === "target" && edge.target.type === "properties") {
    return {
      ...state,
      properties: state.properties.map((item) => item.node_no === edge.target.nodeNo && item.target_ref === edge.source.nodeNo ? { ...item, target_ref: 0 } : item)
    };
  }
  if (edge.label === "measures" && edge.target.type === "measurements") {
    return {
      ...state,
      measurements: state.measurements.map((item) => item.node_no === edge.target.nodeNo ? { ...item, property_ref: 0 } : item)
    };
  }
  return state;
}

function graphId(ref: GraphRef) {
  return `${nodePrefix(ref.type).toLowerCase()}-${ref.nodeNo}`;
}

function parseGraphNode(id: string): GraphRef | null {
  const [prefix, rawNo] = id.split("-");
  const nodeNo = Number(rawNo);
  if (!Number.isFinite(nodeNo)) return null;
  if (prefix === "s") return { type: "substances", nodeNo };
  if (prefix === "c") return { type: "compositions", nodeNo };
  if (prefix === "p") return { type: "properties", nodeNo };
  if (prefix === "m") return { type: "measurements", nodeNo };
  return null;
}

function graphIdForTarget(state: AnnotationState, nodeNo: number) {
  if (state.substances.some((item) => item.node_no === nodeNo)) return `s-${nodeNo}`;
  if (state.compositions.some((item) => item.node_no === nodeNo)) return `c-${nodeNo}`;
  return "";
}

function getRecord(state: AnnotationState, active: NonNullable<ActiveRecord>) {
  return (state[active.type] as AnyRecord[]).find((item) => item.node_no === active.nodeNo) || null;
}

function nodeRecords(state: AnnotationState) {
  return [...state.substances, ...state.compositions, ...state.properties, ...state.measurements];
}

function graphRefs(state: AnnotationState): GraphRef[] {
  return (Object.keys(labels) as EntityType[]).flatMap((type) => (state[type] as AnyRecord[]).map((record) => ({ type, nodeNo: record.node_no })));
}

function recordTitleText(type: EntityType, record: AnyRecord, state: AnnotationState) {
  if (type === "substances") return (record as SubstanceRecord).substance_name || "Substance";
  if (type === "compositions") return (record as CompositionRecord).composition_name || "Composition";
  if (type === "properties") return (record as PropertyRecord).property_name || "Property";
  return measurementTitleText(record as MeasurementRecord, state);
}

function renderRecordTitle(type: EntityType, record: AnyRecord, state: AnnotationState): React.ReactNode {
  if (type !== "measurements") return recordTitleText(type, record, state);
  const { propertyName, valueText, linked, propertyRefText } = measurementTitleParts(record as MeasurementRecord, state);
  return <>
    {linked && propertyRefText && <span className="measurement-title-ref">{propertyRefText}</span>}
    <span className={`measurement-title-property ${linked ? "" : "measurement-title-property-unlinked"}`}>{linked ? propertyName : `<${propertyName}>`}</span>
    {valueText && <>
      <span className="measurement-title-separator">: </span>
      <span className="measurement-title-value">{valueText}</span>
    </>}
  </>;
}

function measurementTitleText(record: MeasurementRecord, state: AnnotationState) {
  const { propertyName, valueText, linked } = measurementTitleParts(record, state);
  const label = linked ? propertyName : `<${propertyName}>`;
  return valueText ? `${label}: ${valueText}` : label;
}

function measurementTitleParts(record: MeasurementRecord, state: AnnotationState) {
  const linkedProperty = state.properties.find((item) => item.node_no === record.property_ref);
  const linked = Boolean(linkedProperty?.property_name?.trim());
  const propertyName = linkedProperty?.property_name?.trim() || "Unlinked Property";
  const propertyRefText = linkedProperty ? `${nodePrefix("properties")}${linkedProperty.node_no}` : "";
  const valueText = measurementDisplayText(record);
  return { propertyName, valueText, linked, propertyRefText };
}

function measurementDisplayText(record: MeasurementRecord) {
  const unitText = prettyMeasurementUnit(arrayToText(record.unit));
  if (record.comparator === "range") {
    const lower = scalarDisplay(record.lower_value);
    const upper = scalarDisplay(record.upper_value);
    const bounds = lower && upper ? `${lower}-${upper}` : lower || upper || "";
    return [bounds, unitText].filter(Boolean).join(" ").trim();
  }
  const valueText = arrayToText(record.value);
  if (!valueText) return "";
  const comparator = record.comparator && record.comparator !== "-" ? `${record.comparator} ` : "";
  return `${comparator}${valueText}${unitText ? ` ${unitText}` : ""}`.trim();
}

function scalarDisplay(value: string | number) {
  const text = String(value ?? "").trim();
  return text && text !== "-" ? text : "";
}

function prettyMeasurementUnit(text: string) {
  return text
    .replace(/([A-Za-zµμ])2\b/g, "$1²")
    .replace(/([A-Za-zµμ])3\b/g, "$1³");
}

function nodeLabel(state: AnnotationState, ref: GraphRef) {
  const record = (state[ref.type] as AnyRecord[]).find((item) => item.node_no === ref.nodeNo);
  return `${nodePrefix(ref.type)}${ref.nodeNo}${record ? ` ${recordTitleText(ref.type, record, state)}` : ""}`;
}

function lookupLinkedTargetName(state: AnnotationState, nodeNo: number) {
  const substance = state.substances.find((item) => item.node_no === nodeNo);
  if (substance) return `${nodePrefix("substances")}${nodeNo} ${recordTitleText("substances", substance, state)}`;
  const composition = state.compositions.find((item) => item.node_no === nodeNo);
  if (composition) return `${nodePrefix("compositions")}${nodeNo} ${recordTitleText("compositions", composition, state)}`;
  return `Ref ${nodeNo}`;
}

function materialRefType(state: AnnotationState, nodeNo: number): "substances" | "compositions" | null {
  if (state.substances.some((item) => item.node_no === nodeNo)) return "substances";
  if (state.compositions.some((item) => item.node_no === nodeNo)) return "compositions";
  return null;
}

function nodePrefix(type: EntityType) {
  return ({ substances: "S", compositions: "C", properties: "P", measurements: "M" } as Record<EntityType, string>)[type];
}

function singular(type: EntityType) {
  return ({ substances: "Substance", compositions: "Composition", properties: "Property", measurements: "Measurement" } as Record<EntityType, string>)[type];
}

function statusClass(status: Status) {
  if (status === "Completed") return "complete";
  if (status === "Partially complete") return "partial";
  return "open";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Check that the local backend is running.";
}

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
}

function arrayToText(value: Array<string | number> | string[]) {
  return value.map(String).join(" | ");
}

function editableFieldValue(value: string, editing: boolean) {
  if (editing && value === "-") return "";
  return value || "";
}

function textToStringArray(value: string) {
  return value.split("|").map((item) => item.trim()).filter(Boolean);
}

function textToArray(value: string): Array<string | number> {
  return textToStringArray(value);
}

function textToDraftStringArray(value: string) {
  return value === "" ? [] : value.split("|");
}

function textToDraftArray(value: string): Array<string | number> {
  return textToDraftStringArray(value);
}

function recordSelector(type: EntityType, nodeNo: number) {
  return `[data-record-type="${type}"][data-record-node="${nodeNo}"]`;
}

function highlightSelector(type: EntityType, nodeNo: number, index: number) {
  return `[data-entity-type="${type}"][data-node-no="${nodeNo}"][data-span-index="${index}"]`;
}

const root = document.getElementById("root");
const reactRoot = (window as any).__schemaAnnotatorRoot || createRoot(root!);
(window as any).__schemaAnnotatorRoot = reactRoot;
reactRoot.render(<App/>);
