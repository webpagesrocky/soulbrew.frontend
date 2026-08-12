interface IconProps {
  name: "dashboard" | "orders" | "menu" | "cash" | "team" | "external" | "logout" | "coffee" | "sales" | "clock" | "check" | "trend";
  size?: number;
}

const paths: Record<IconProps["name"], React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  orders: <><path d="M9 5h6"/><path d="M9 9h6"/><path d="M9 13h6"/><path d="M9 17h4"/><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v2h6V3"/></>,
  menu: <><path d="M4 3l17 17"/><path d="M10 7L5 2 2 5l5 5"/><path d="M14 14l6-6a3 3 0 0 0-4-4l-6 6"/><path d="M14 14l6 6"/></>,
  cash: <><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M7 10h4"/><path d="M16 10h1"/><path d="M16 14h1"/><path d="M7 15h5"/></>,
  team: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  external: <><path d="M14 3h7v7"/><path d="M10 14L21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></>,
  coffee: <><path d="M3 8h14v7a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8z"/><path d="M17 10h2a3 3 0 0 1 0 6h-2"/><path d="M7 3v2"/><path d="M11 3v2"/><path d="M15 3v2"/></>,
  sales: <><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  check: <><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></>,
  trend: <><path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/></>,
};

export function Icon({ name, size = 19 }: IconProps) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

