import fs from "fs/promises";

const inputPath = "./src/data/fujisawa-spots.csv";
const outputPath = "./src/data/fujisawa-gourmet.json";

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function splitMultiValue(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

async function main() {
  const csvText = await fs.readFile(inputPath, "utf-8");

  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    throw new Error("CSVにデータがありません");
  }

  const headers = parseCsvLine(lines[0]);

  const items = lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ""]));

    return {
      name: row.name?.trim() || "",
      area: row.area?.trim() || "",
      category: row.category?.trim() || "",
      desc: row.desc?.trim() || "",
      tags: splitMultiValue(row.tags),
      scene: splitMultiValue(row.scene),
      status: row.status?.trim() || "下書き",
      memo: row.memo?.trim() || ""
    };
  });

  const published = items.filter((item) => item.status === "公開");

  await fs.writeFile(outputPath, JSON.stringify(published, null, 2), "utf-8");

  console.log(`変換完了: ${published.length}件`);
  console.log(`出力先: ${outputPath}`);
}

main().catch((err) => {
  console.error("変換エラー:", err);
  process.exit(1);
});