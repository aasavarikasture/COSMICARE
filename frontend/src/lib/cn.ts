export const cn = (...inputs: any[]) => {
  let result = '';
  for (const input of inputs) {
    if (typeof input === 'string') {
      result += input + ' ';
    } else if (Array.isArray(input)) {
      for (const i of input) {
        if (typeof i === 'string') {
          result += i + ' ';
        }
      }
    } else if (input && typeof input === 'object') {
      for (const key of Object.keys(input)) {
        if (input[key]) {
          result += key + ' ';
        }
      }
    }
  }
  return result.trim();
};
