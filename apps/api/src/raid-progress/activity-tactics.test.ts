import { strategyActivitySaveSchema, strategyPresetSaveSchema } from "@ttz/contracts";
import type { Prisma } from "@ttz/database";
import { describe, expect, it, vi } from "vitest";
import { signupStatusToCode } from "../activities/activity.constants";
import { validateActivityTactics } from "./activity-tactics";

const presetTask = { taskTypeId: 1, kind: "TIMELINE", label: "第一轮打断", orderIndex: 0 } as const;
const task = {
  ...presetTask,
  executorSignupId: 10n,
  fallbackSignupId: null,
  targetSignupId: null,
  offsetMs: 1000,
  windowMs: 500,
};
function signup(id: bigint, status = signupStatusToCode.CONFIRMED) {
  return {
    id,
    userId: 2n,
    status,
    preferredSpecId: 1,
    specs: { name: "防护" },
    user: { guildNickname: "团员", name: null },
    character: {
      id: 3n,
      name: "角色",
      serverName: "服务器",
      classId: 1,
      characterClass: { name: "战士", en_name: null },
    },
  };
}
function transaction(...signups: ReturnType<typeof signup>[]) {
  const findMany = vi.fn().mockResolvedValue(signups);
  return { findMany, tx: { activitySignup: { findMany } } as unknown as Prisma.TransactionClient };
}

describe("strategy requirements and activity assignments", () => {
  it("accepts an untimed preset and rejects virtual slots, concrete times and board configuration", () => {
    const draft = {
      items: [
        { type: "POSITIONING", title: "分散站位", orderIndex: 0, markdown: null },
        { type: "TIMELINE", taskTypeId: 1, title: "第一轮打断", orderIndex: 1, markdown: null },
      ],
    };
    expect(strategyPresetSaveSchema.safeParse(draft).success).toBe(true);
    expect(strategyPresetSaveSchema.safeParse({ ...draft, slots: [] }).success).toBe(false);
    expect(
      strategyPresetSaveSchema.safeParse({
        ...draft,
        items: [{ ...draft.items[1], executorSlotKey: "tank" }],
      }).success,
    ).toBe(false);
    expect(
      strategyPresetSaveSchema.safeParse({
        ...draft,
        items: [{ ...draft.items[1], offsetMs: 1000 }],
      }).success,
    ).toBe(false);
    expect(
      strategyPresetSaveSchema.safeParse({
        ...draft,
        items: [{ ...draft.items[0], config: {} }],
      }).success,
    ).toBe(false);
    expect(
      strategyActivitySaveSchema.safeParse({
        revision: 1,
        notes: [],
        tasks: [{ ...presetTask, executorSignupId: null, fallbackSignupId: null, targetSignupId: null }],
      }).success,
    ).toBe(true);
  });

  it("allows planning before confirmation but requires a confirmed executor and time before locking", async () => {
    const { tx } = transaction(signup(10n));
    const unassigned = { ...task, executorSignupId: null, offsetMs: null };
    await expect(validateActivityTactics(tx, 99n, [unassigned], false)).resolves.toBeTypeOf("function");
    await expect(validateActivityTactics(tx, 99n, [unassigned], true)).rejects.toMatchObject({
      response: { code: "STRATEGY_TASK_EXECUTOR_UNBOUND" },
    });
    await expect(validateActivityTactics(tx, 99n, [{ ...task, offsetMs: null }], true)).rejects.toMatchObject({
      response: { code: "STRATEGY_TASK_TIME_REQUIRED" },
    });
  });

  it("scopes assignments to the activity and only permits reserves as backup", async () => {
    const { tx, findMany } = transaction(signup(10n), signup(11n, signupStatusToCode.BENCH));
    await expect(validateActivityTactics(tx, 99n, [{ ...task, executorSignupId: 11n }], false)).rejects.toMatchObject({
      response: { code: "STRATEGY_SIGNUP_INVALID" },
    });
    await expect(validateActivityTactics(tx, 99n, [{ ...task, targetSignupId: 42n }], false)).rejects.toMatchObject({
      response: { code: "STRATEGY_SIGNUP_INVALID" },
    });
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { activityId: 99n, id: { in: [10n, 42n] } } }),
    );
    const withBackup = { ...task, fallbackSignupId: 11n };
    const freeze = await validateActivityTactics(tx, 99n, [withBackup], true);
    expect(freeze(withBackup)).toMatchObject({
      executor: { memberName: "团员", characterName: "角色", specName: "防护" },
      fallback: { userId: "2" },
      target: null,
    });
  });

  it("detects overlaps by the same actual signup and permits adjacent windows", async () => {
    const { tx } = transaction(signup(10n));
    const another = { ...task, label: "第二轮打断" };
    await expect(validateActivityTactics(tx, 99n, [task, { ...another, offsetMs: 1200 }], false)).rejects.toMatchObject(
      { response: { code: "STRATEGY_TASK_TIME_CONFLICT" } },
    );
    await expect(validateActivityTactics(tx, 99n, [task, { ...another, offsetMs: 1500 }], true)).resolves.toBeTypeOf(
      "function",
    );
  });
});
