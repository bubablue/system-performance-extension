export function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0";
  }
  const k = 1024;
  const sizes = ["B", "K", "M", "G"];
  let i = Math.floor(Math.log(bytes) / Math.log(k));
  let value = bytes / Math.pow(k, i);
  
  // If value is >= 100 and we can go to next unit, use next unit with decimal
  if (value >= 100 && i < sizes.length - 1) {
    i++;
    value = bytes / Math.pow(k, i);
  }
  
  // Format with maximum 2-3 characters total
  let formatted: string;
  if (value >= 10) {
    formatted = Math.round(value).toString();
  } else {
    formatted = value.toFixed(1);
    // Remove .0 if it's a whole number
    if (formatted.endsWith('.0')) {
      formatted = formatted.slice(0, -2);
    }
  }
  
  return formatted + sizes[i];
}

export function generateMiniGraph(values: number[], maxValue: number = 100): string {
  if (values.length === 0) {
    return "░░░░░░░░░░░░░░░";
  }

  const chars = ["░", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const normalized = values.map((v) => Math.min(v / maxValue, 1));

  return normalized
    .map((v) => {
      const index = Math.floor(v * (chars.length - 1));
      return chars[index];
    })
    .join("");
}

export function addToHistory(historyData: any, key: string, value: number, historyLength: number = 15) {
  historyData[key].push(value);
  if (historyData[key].length > historyLength) {
    historyData[key].shift();
  }
}
