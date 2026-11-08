import CasePage from "@/pages/CasePage";
import CreatePage from "@/pages/CreatePage";
import RoomPage from "@/pages/RoomPage";
import { usePath } from "@/lib/router";

export default function App() {
  const path = usePath();
  const caseMatch = path.match(/^\/case\/([0-9a-f-]{36})$/);
  if (caseMatch) return <CasePage key={caseMatch[1]} id={caseMatch[1]} />;
  const roomMatch = path.match(/^\/room\/([0-9a-f-]{36})$/);
  if (roomMatch) return <RoomPage key={roomMatch[1]} id={roomMatch[1]} />;
  return <CreatePage />;
}