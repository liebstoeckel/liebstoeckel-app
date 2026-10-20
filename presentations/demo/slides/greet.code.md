# greet.ts, three states

Each fenced block below is one state of the animated code on the "Code, alive"
slide; the build highlights them, and `<CodeMagic>` morphs one into the next.

```ts
function greet(name) {
  return "hi " + name
}
```

```ts
function greet(name: string) {
  return "hi " + name
}
```

```ts
function greet(name: string, loud = false) {
  const msg = "hi " + name
  return loud ? msg.toUpperCase() : msg
}
```
