import { MAX_MESSAGE_CHARS } from "@jev-chat/server/types";
import { useState } from "react";

/** The message input. Sends trimmed, non-empty text and clears itself; autofocuses on mount. */
export function Composer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
  };
  return (
    <form
      className="join w-full"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        className="input join-item input-lg w-full"
        placeholder="Ask about the weather, search the web, add a task, control the lights…"
        value={text}
        maxLength={MAX_MESSAGE_CHARS}
        // oxlint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        onChange={(e) => setText(e.target.value)}
      />
      <button className="btn btn-primary btn-lg join-item" disabled={disabled || !text.trim()}>
        Send
      </button>
    </form>
  );
}
