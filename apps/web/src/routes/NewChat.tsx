import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";

import { useCreateConversation } from "../queries.ts";

/** Creates a conversation once on mount and redirects to it, showing a spinner meanwhile. */
export function NewChat() {
  const create = useCreateConversation();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void create.mutateAsync().then((c) => navigate(`/c/${c.id}`, { replace: true }));
  }, [create, navigate]);

  return (
    <div className="grid flex-1 place-items-center">
      <span className="loading loading-dots loading-lg" />
    </div>
  );
}
