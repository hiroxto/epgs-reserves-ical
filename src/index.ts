import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import ical from "ical-generator";
import { z } from "zod";

type Bindings = {
  ACCESS_KEY: string;
  EPGS_ICAL_BUCKET: R2Bucket;
};

// フルパラメータで送ってくるのは許容し，最低限必要な部分だけバリデーションする
const schema = z.object({
  reserves: z.array(
    z.object({
      id: z.number().positive(),
      startAt: z.number().positive(),
      endAt: z.number().positive(),
      name: z.string(),
      description: z.string(),
      extended: z.string(),
    }),
  ),
});

const iCalFileName = "epgs.ical";

const app = new Hono<{ Bindings: Bindings }>();

app.use(async (c, next) => {
  if (
    (c.req.method === "POST" && c.req.header("X-Access-Key") !== c.env.ACCESS_KEY) ||
    (c.req.method === "GET" && c.req.query("access-key") !== c.env.ACCESS_KEY)
  ) {
    return c.json(
      {
        error: {
          message: "認証エラー!",
        },
      },
      400,
    );
  }

  await next();
});

app.post(
  "/update",
  zValidator("json", schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            message: "バリデーションエラー!",
            detail: result.error.flatten(),
          },
        },
        400,
      );
    }
  }),
  async c => {
    const body = c.req.valid("json");
    const calendar = ical({
      name: "EPGStation録画予約",
      description: "EPGStation録画予約情報のカレンダー",
    });
    for (const reserve of body.reserves) {
      calendar.createEvent({
        id: reserve.id,
        start: new Date(reserve.startAt),
        end: new Date(reserve.endAt),
        summary: reserve.name,
        description: `${reserve.description}\n\n${reserve.extended}`,
      });
    }

    const bucket = c.env.EPGS_ICAL_BUCKET;
    await bucket.put(iCalFileName, calendar.toString());

    return c.text("更新しますた!");
  },
);

app.get("/epgs.ical", async c => {
  const bucket = c.env.EPGS_ICAL_BUCKET;
  const ical = await bucket.get(iCalFileName);
  if (ical === null) {
    console.error("iCal missing in R2");
    return c.json(
      {
        error: {
          message: "R2にiCalが存在しない!",
        },
      },
      500,
    );
  }

  const icalBody = await ical.text();

  c.header("Content-Type", "text/calendar");
  return c.body(icalBody, 200);
});

export default app;
