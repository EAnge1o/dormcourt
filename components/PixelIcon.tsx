type IconName = "bowl" | "box" | "broom" | "scales" | "gavel";

const COLORS: Record<string, string> = {
  i: "#2b1d16",
  b: "#a0622d",
  y: "#f2c14e",
  r: "#c0392b",
  g: "#5f9e2f",
  w: "#f8ecd4",
};

const GRIDS: Record<IconName, string[]> = {
  bowl: [
    "............",
    "...w..w.....",
    "............",
    ".iiiiiiiiii.",
    ".irrrrrrrri.",
    ".iwwwwwwwwi.",
    "..iiiiiiii..",
    "...ibbbbi...",
    "....iiii....",
    "............",
    "............",
    "............",
  ],
  box: [
    "............",
    ".iiiiiiiiii.",
    ".ibbbiibbbi.",
    ".ibbbiibbbi.",
    ".iiiiiiiiii.",
    ".ibbbiibbbi.",
    ".ibbbiibbbi.",
    ".ibbbiibbbi.",
    ".iiiiiiiiii.",
    "............",
    "............",
    "............",
  ],
  broom: [
    "............",
    ".........b..",
    "........b...",
    ".......b....",
    "......b.....",
    ".....b......",
    "....yyy.....",
    "...yyyyy....",
    "...yiyiy....",
    "...iiiii....",
    "............",
    "............",
  ],
  scales: [
    "............",
    ".....i......",
    ".iiiiiiiii..",
    "..i.....i...",
    ".yyy...yyy..",
    ".yyy...yyy..",
    "..i.....i...",
    ".....i......",
    "....iii.....",
    "...iiiii....",
    "............",
    "............",
  ],
  gavel: [
    "............",
    ".bbb........",
    ".bbb........",
    "..bb........",
    "...bb.......",
    "....bb......",
    ".....bb.....",
    "......bb....",
    ".....iii....",
    "....iiiii...",
    "............",
    "............",
  ],
};

export function PixelIcon({ name, size = 36 }: { name: IconName; size?: number }) {
  const grid = GRIDS[name];
  const cell = size / 12;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {grid.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === "." ? null : (
            <rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill={COLORS[ch]} />
          ),
        ),
      )}
    </svg>
  );
}