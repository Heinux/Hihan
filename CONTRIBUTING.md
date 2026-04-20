# Contributing

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

## Testing

```bash
npm run test
```

## Type-checking

```bash
npx tsc --noEmit
```

## Code Style

- TypeScript strict mode
- Single quotes, trailing commas, semicolons (see `.prettierrc`)
- UI text in French, code comments in English
- No linter is configured; TypeScript strict mode serves as primary static analysis

## Pull Requests

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run build` to verify tests pass and types check
5. Submit a pull request