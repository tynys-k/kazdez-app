import globals from "globals";

// Минимальный линтер с одной задачей: ловить обращения к несуществующим именам.
// Именно такая ошибка уронила окно выплаты зарплаты на боевом сайте:
// EXPENSE_TYPES использовался в modals.jsx, но не был импортирован. Сборка это
// пропускает — неопределённое имя выясняется только при выполнении, а тесты
// покрывают чистые расчёты, а не отрисовку.
export default [
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Единственное правило, ради которого всё это заведено.
      "no-undef": "error",
      // no-unused-vars намеренно выключен: без плагина React линтер не видит
      // использование компонентов в JSX и ругается на каждую иконку.
      "no-unused-vars": "off",
    },
  },
  {
    files: ["src/**/*.test.{js,jsx}"],
    languageOptions: { globals: { ...globals.node } },
  },
];
