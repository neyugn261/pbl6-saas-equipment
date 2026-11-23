import { useEffect, useState } from "react";
import { Building2, DoorOpen, Layers, MapPin } from "lucide-react";
import { api } from "../../api/client";
import { getSessionGeneration } from "../../auth/session";
import { useDirectory } from "../../routes/registration-data";
import type { Page } from "../../types/domain";
import {
  buildLocationTree,
  type LocationNode,
  type LocationRow,
} from "./location-tree";
import "./management.css";

const labels: Record<string, string> = {
  BUILDING: "Tòa nhà",
  FLOOR: "Tầng",
  ROOM: "Phòng",
  AREA: "Khu vực",
};
function TreeNode({ node }: { node: LocationNode }) {
  const Icon =
    node.type === "BUILDING"
      ? Building2
      : node.type === "FLOOR"
        ? Layers
        : node.type === "ROOM"
          ? DoorOpen
          : MapPin;
  const label = (
    <>
      <Icon size={16} aria-hidden="true" />
      <span>
        <strong>{node.name}</strong>
        <small>
          {" "}
          · {node.code || labels[node.type ?? ""] || "Vị trí"}
          {node.status === "INACTIVE" ? " · Ngừng dùng" : ""}
        </small>
      </span>
      <small className="management-tree__count">
        {node.equipmentCount == null
          ? "Số máy chưa tải được"
          : `${node.equipmentCount} thiết bị`}
      </small>
    </>
  );
  return (
    <li>
      {node.children.length ? (
        <details open>
          <summary>{label}</summary>
          <ul>
            {node.children.map((child) => (
              <TreeNode key={child.id} node={child} />
            ))}
          </ul>
        </details>
      ) : (
        <div className="management-tree__leaf">{label}</div>
      )}
    </li>
  );
}
export function LocationTreeView({
  locations,
  equipmentCounts,
}: {
  locations: LocationRow[];
  equipmentCounts?: Record<string, number>;
}) {
  const { roots, invalidAncestry } = buildLocationTree(
    locations,
    equipmentCounts,
  );
  return (
    <>
      {invalidAncestry && (
        <p role="alert">
          Một số vị trí có liên kết cấp trên không hợp lệ; đang hiển thị riêng
          để kiểm tra.
        </p>
      )}
      <ul className="management-tree" aria-label="Cây vị trí lắp đặt">
        {roots.map((node) => (
          <TreeNode key={node.id} node={node} />
        ))}
      </ul>
      {!roots.length && <p>Chưa có vị trí lắp đặt.</p>}
    </>
  );
}

export function SiteLocationContents({ siteId }: { siteId: string }) {
  const locations = useDirectory<LocationRow[]>(
    "organization",
    `/sites/${siteId}/locations`,
  );
  const generation = getSessionGeneration(),
    key = `${generation}:${siteId}`;
  const [state, setState] = useState<{
    key: string;
    counts?: Record<string, number>;
    withoutLocation?: number;
    error?: string;
  }>({ key: "" });
  useEffect(() => {
    let active = true;
    async function read() {
      const counts: Record<string, number> = {};
      let page = 1,
        readCount = 0, withoutLocation = 0;
      let expectedTotal: number | undefined;
      const seen = new Set<string>();
      while (true) {
        const result = await api.assetM2<
          Page<{ id: string; locationId: string | null }>
        >(
          `/equipment?siteId=${siteId}&page=${page}&pageSize=100&sort=assetCode`,
        );
        if (!active || generation !== getSessionGeneration()) return;
        if (expectedTotal !== undefined && expectedTotal !== result.total) throw new Error('Equipment changed during aggregation');
        expectedTotal = result.total;
        for (const item of result.items) {
          if (seen.has(item.id)) throw new Error('Equipment page changed during aggregation');
          seen.add(item.id);
          if (item.locationId)
            counts[item.locationId] = (counts[item.locationId] ?? 0) + 1;
          else withoutLocation++;
        }
        readCount += result.items.length;
        if (readCount >= result.total) break;
        if (!result.items.length)
          throw new Error(
            "Danh sách thiết bị đã thay đổi. Mở lại địa điểm để tải số lượng mới.",
          );
        page++;
      }
      if (active) setState({ key, counts, withoutLocation });
    }
    void read().catch(() => {
      if (active)
        setState({
          key,
          error:
            "Chưa tổng hợp được số thiết bị. Cây vị trí vẫn hiển thị theo dữ liệu địa điểm.",
        });
    });
    return () => {
      active = false;
    };
  }, [siteId, generation, key]);
  return (
    <>
      {locations.loading && <p role="status">Đang tải vị trí…</p>}
      {locations.error && <p role="alert">{locations.error}</p>}
      {state.key === key && state.error && <p role="alert">{state.error}</p>}
      {state.key === key && !!state.withoutLocation && <p>{state.withoutLocation} thiết bị chưa có vị trí chi tiết; chưa được tính vào các nhánh bên dưới.</p>}
      {locations.value && (
        <LocationTreeView
          locations={locations.value}
          equipmentCounts={state.key === key ? state.counts : undefined}
        />
      )}
    </>
  );
}
export default function SiteLocationTree({ siteId }: { siteId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Thu gọn cây vị trí" : "Xem cây vị trí & số thiết bị"}
      </button>
      {open && <SiteLocationContents siteId={siteId} />}
    </div>
  );
}
