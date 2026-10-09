import type { Comment } from "@app/api-client";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useAuth } from "../lib/auth";
import { COMMENT_MAX, timeAgo, withoutAuthor } from "../lib/comments";
import { errorMessage, isApiError } from "../lib/errors";
import { DisplayNameForm } from "./DisplayNameForm";
import { Button } from "./ui";

const POSTING_TOO_FAST = { rate_limited: "You're posting quickly. Wait a minute, then try again." };

/**
 * Comments on a record, inline below its details on Dig (never a modal over the player).
 * Signed-in people can report a comment or block its author; blocked authors' comments stop
 * showing to them, and the Account screen lists them for unblocking.
 */
export function Comments({ recordKey }: { recordKey: string }) {
  const { api, me } = useAuth();
  const userId = me?.user.id ?? null;
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The name chosen here, before /me catches up; null asks for one again (a 409 on posting).
  const [chosenName, setChosenName] = useState<string | null | undefined>(undefined);
  const [nameOwner, setNameOwner] = useState(userId);
  if (nameOwner !== userId) {
    setNameOwner(userId);
    setChosenName(undefined);
  }
  const displayName = chosenName === undefined ? (me?.profile?.displayName ?? null) : chosenName;

  // biome-ignore lint/correctness/useExhaustiveDependencies: userId changes which comments are "mine"; attempt retries
  useEffect(() => {
    let live = true;
    setComments(null);
    setLoadFailed(false);
    setError(null);
    setNotice(null);
    setBody("");
    api
      .comments(recordKey)
      .then((r) => live && setComments(r.comments))
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, [api, recordKey, userId, attempt]);

  const say = (message: { error?: string; notice?: string }) => {
    setError(message.error ?? null);
    setNotice(message.notice ?? null);
  };

  const post = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    say({});
    try {
      const comment = await api.addComment(recordKey, text);
      setComments((prev) => [comment, ...(prev ?? [])]);
      setBody("");
    } catch (err) {
      if (isApiError(err, "conflict")) setChosenName(null);
      say({ error: errorMessage(err, "Couldn't post the comment. Try again.", POSTING_TOO_FAST) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    say({});
    try {
      await api.deleteComment(id);
      setComments((prev) => (prev ?? []).filter((c) => c.id !== id));
    } catch (err) {
      say({ error: errorMessage(err, "Couldn't delete the comment.") });
    }
  };

  const report = async (id: string): Promise<boolean> => {
    say({});
    try {
      await api.reportComment(id);
      return true;
    } catch (err) {
      // Reports count only from people with a display name: ask for one.
      if (isApiError(err, "conflict")) setChosenName(null);
      say({ error: errorMessage(err, "Couldn't report the comment.") });
      return false;
    }
  };

  const block = async (comment: Comment): Promise<boolean> => {
    say({});
    try {
      const blocked = await api.blockCommenter(comment.id);
      setComments((prev) => withoutAuthor(prev ?? [], comment.author.displayName));
      say({ notice: `Blocked ${blocked.displayName}. Unblock them any time from Account.` });
      return true;
    } catch (err) {
      say({ error: errorMessage(err, "Couldn't block that commenter.") });
      return false;
    }
  };

  return (
    <View testID="comments" className="mt-6">
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-2">
        Comments{comments?.length ? ` · ${comments.length}` : ""}
      </Text>
      {error ? (
        <Text accessibilityRole="alert" className="mb-2 text-warn">
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text accessibilityLiveRegion="polite" className="mb-2 text-ink-2">
          {notice}
        </Text>
      ) : null}
      {!me ? (
        <Pressable accessibilityRole="link" onPress={() => router.push("/login")} className="mb-3">
          <Text className="text-accent underline">Sign in to comment.</Text>
        </Pressable>
      ) : !me.limits.comments ? null : displayName === null ? (
        <View className="mb-3">
          <DisplayNameForm
            prompt="Choose a display name to comment. It's shown with everything you post."
            onSaved={(name) => {
              setChosenName(name);
              setError(null);
            }}
          />
        </View>
      ) : (
        <View className="mb-3">
          <TextInput
            testID="comment-input"
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={COMMENT_MAX}
            placeholder="Samples, pressings, the story behind it…"
            placeholderTextColor="#a89f93"
            className="mb-2 min-h-16 rounded-md border border-line bg-surface-2 p-3 text-ink"
          />
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 text-xs text-ink-2">Posting as {displayName}. No links.</Text>
            <Button
              testID="comment-post"
              variant="primary"
              label="Post"
              busy={busy}
              disabled={!body.trim()}
              onPress={() => void post()}
            />
          </View>
        </View>
      )}
      {loadFailed ? (
        <View className="flex-row items-center">
          <Text className="mr-3 text-ink-2">Couldn't load comments.</Text>
          <TextAction label="Try again" onPress={() => setAttempt((n) => n + 1)} />
        </View>
      ) : comments === null ? (
        <Text className="text-ink-2">Loading comments…</Text>
      ) : comments.length === 0 ? (
        <Text className="text-ink-2">No comments yet.</Text>
      ) : (
        comments.map((c) => (
          <CommentRow
            key={c.id}
            comment={c}
            signedIn={Boolean(me)}
            onDelete={() => void remove(c.id)}
            onReport={() => report(c.id)}
            onBlock={() => block(c)}
          />
        ))
      )}
    </View>
  );
}

function CommentRow({
  comment,
  signedIn,
  onDelete,
  onReport,
  onBlock,
}: {
  comment: Comment;
  signedIn: boolean;
  onDelete: () => void;
  onReport: () => Promise<boolean>;
  onBlock: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState<"delete" | "block" | null>(null);
  const [reported, setReported] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const a = comment.author;
  return (
    <View className="mb-2 rounded-md border border-line bg-surface px-3 py-2">
      <View className="mb-1 flex-row flex-wrap items-center">
        <Text className="mr-2 font-semibold text-ink">{a.displayName}</Text>
        <Text className="mr-2 text-xs text-ink-2">{a.rank.title}</Text>
        {a.pro ? (
          <View className="mr-2 rounded bg-accent px-1.5">
            <Text className="text-xs font-semibold text-accent-ink">Pro</Text>
          </View>
        ) : null}
        <Text className="text-xs text-ink-2">{timeAgo(comment.createdAt, new Date())}</Text>
      </View>
      <Text className="text-ink">{comment.body}</Text>
      <View className="mt-1 flex-row flex-wrap items-center">
        {comment.mine ? (
          confirming === "delete" ? (
            <>
              <Text className="mr-3 text-xs text-ink-2">Delete this comment?</Text>
              <TextAction label="Delete" warn onPress={onDelete} />
              <TextAction label="Keep" onPress={() => setConfirming(null)} />
            </>
          ) : (
            <TextAction label="Delete" onPress={() => setConfirming("delete")} />
          )
        ) : !signedIn ? null : confirming === "block" ? (
          <>
            <Text className="mb-1 w-full text-xs text-ink-2">
              Block {a.displayName}? You won't see their comments. They aren't told, and you can
              unblock them from Account.
            </Text>
            <TextAction
              label={blocking ? "Blocking…" : "Block"}
              warn
              onPress={() => {
                if (blocking) return;
                setBlocking(true);
                void onBlock().then((ok) => {
                  setBlocking(false);
                  if (!ok) setConfirming(null);
                });
              }}
            />
            <TextAction label="Cancel" onPress={() => setConfirming(null)} />
          </>
        ) : (
          <>
            {reported ? (
              <Text className="mr-4 py-2 text-xs text-ink-2">
                Reported. Thanks for flagging it.
              </Text>
            ) : (
              <TextAction
                label="Report"
                onPress={() => void onReport().then((ok) => ok && setReported(true))}
              />
            )}
            <TextAction label="Block" onPress={() => setConfirming("block")} />
          </>
        )}
      </View>
    </View>
  );
}

function TextAction({
  label,
  onPress,
  warn,
}: {
  label: string;
  onPress: () => void;
  warn?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6} className="mr-4 py-2">
      <Text className={`text-xs underline ${warn ? "text-warn" : "text-ink-2"}`}>{label}</Text>
    </Pressable>
  );
}
