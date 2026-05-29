const MAX_SAFE_AMOUNT = Number.MAX_SAFE_INTEGER;
const MAX_SAFE_AMOUNT_TEXT = new Intl.NumberFormat("ja-JP").format(MAX_SAFE_AMOUNT);

type Token =
  | { type: "number"; value: number }
  | { type: "operator"; value: "+" | "-" | "*" | "/" }
  | { type: "leftParen" }
  | { type: "rightParen" };

function invalidExpression(label: string) {
  return new Error(`${label}は有効な数式で入力してください。`);
}

function tokenizeAmountExpression(input: string, label: string) {
  const source = input.trim().startsWith("=") ? input.trim().slice(1) : input.trim();
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char) || char === ",") {
      index += 1;
      continue;
    }

    if (/\d/.test(char)) {
      let endIndex = index + 1;
      while (endIndex < source.length && /[\d,]/.test(source[endIndex])) {
        endIndex += 1;
      }

      const rawNumber = source.slice(index, endIndex).replaceAll(",", "");
      if (rawNumber.length === 0) {
        throw invalidExpression(label);
      }
      if (BigInt(rawNumber) > BigInt(MAX_SAFE_AMOUNT)) {
        throw new Error(`${label}は${MAX_SAFE_AMOUNT_TEXT}以下で入力してください。`);
      }

      tokens.push({ type: "number", value: Number.parseInt(rawNumber, 10) });
      index = endIndex;
      continue;
    }

    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }

    if (char === "(") {
      tokens.push({ type: "leftParen" });
      index += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ type: "rightParen" });
      index += 1;
      continue;
    }

    throw invalidExpression(label);
  }

  return tokens;
}

class AmountExpressionParser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly label: string,
  ) {}

  parse() {
    const value = this.parseExpression();
    if (this.index !== this.tokens.length) {
      throw invalidExpression(this.label);
    }

    return this.validateNumber(value);
  }

  private parseExpression() {
    let value = this.parseTerm();

    while (this.matchOperator("+") || this.matchOperator("-")) {
      const operator = this.consumeOperator();
      const right = this.parseTerm();
      value = operator === "+" ? value + right : value - right;
      value = this.validateNumber(value);
    }

    return value;
  }

  private parseTerm() {
    let value = this.parseFactor();

    while (this.matchOperator("*") || this.matchOperator("/")) {
      const operator = this.consumeOperator();
      const right = this.parseFactor();
      value = operator === "*" ? value * right : value / right;
      value = this.validateNumber(value);
    }

    return value;
  }

  private parseFactor(): number {
    const token = this.tokens[this.index];

    if (this.matchOperator("+") || this.matchOperator("-")) {
      const operator = this.consumeOperator();
      const value = this.parseFactor();
      return operator === "-" ? -value : value;
    }

    if (token?.type === "number") {
      this.index += 1;
      return token.value;
    }

    if (token?.type === "leftParen") {
      this.index += 1;
      const value = this.parseExpression();
      if (this.tokens[this.index]?.type !== "rightParen") {
        throw invalidExpression(this.label);
      }

      this.index += 1;
      return value;
    }

    throw invalidExpression(this.label);
  }

  private matchOperator(operator: "+" | "-" | "*" | "/") {
    const token = this.tokens[this.index];
    return token?.type === "operator" && token.value === operator;
  }

  private consumeOperator() {
    const token = this.tokens[this.index];
    if (token?.type !== "operator") {
      throw invalidExpression(this.label);
    }

    this.index += 1;
    return token.value;
  }

  private validateNumber(value: number) {
    if (!Number.isFinite(value)) {
      throw invalidExpression(this.label);
    }

    if (Math.abs(value) > MAX_SAFE_AMOUNT) {
      throw new Error(`${this.label}は${MAX_SAFE_AMOUNT_TEXT}以下で入力してください。`);
    }

    return value;
  }
}

export function parseAmountExpression(value: string, label: string) {
  if (value.trim().length === 0) {
    throw new Error(`${label}を入力してください。`);
  }

  const parser = new AmountExpressionParser(tokenizeAmountExpression(value, label), label);
  const parsedValue = parser.parse();

  if (!Number.isInteger(parsedValue)) {
    throw new Error(`${label}は整数になる式で入力してください。`);
  }

  return parsedValue;
}

export function parsePositiveAmountExpression(value: string, label: string) {
  const amount = parseAmountExpression(value, label);
  if (amount <= 0) {
    throw new Error(`${label}は1以上の整数で入力してください。`);
  }

  return amount;
}

export function parseNonnegativeAmountExpression(value: string, label: string) {
  const amount = parseAmountExpression(value, label);
  if (amount < 0) {
    throw new Error(`${label}は0以上の整数で入力してください。`);
  }

  return amount;
}

export function parseAmountExpressionForPreview(value: string) {
  try {
    return parseAmountExpression(value, "金額");
  } catch {
    return 0;
  }
}
