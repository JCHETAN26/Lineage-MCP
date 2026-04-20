// Patterns that reference column/feature names in ML code
const PATTERNS = [
    // sklearn: ColumnTransformer / make_column_selector / Pipeline feature names
    {
        re: /ColumnTransformer\s*\(\s*\[[\s\S]*?["'`](\w+)["'`]/gi,
        confidence: "high",
        label: "sklearn.ColumnTransformer",
        provenance: "scikit-learn transformer scan",
    },
    // sklearn: df[["col1", "col2"]] used as X features
    {
        re: /\bX\s*=\s*\w+\s*\[\s*\[([^\]]+)\]\s*\]/gi,
        confidence: "high",
        label: "sklearn.feature_selection",
        provenance: "scikit-learn feature selection scan",
    },
    // pandas: df["col"] or df[["col"]] assignment to features
    {
        re: /\bfeatures?\s*=.*?\[["'`](\w+)["'`]\]/gi,
        confidence: "high",
        label: "pandas.feature_column",
        provenance: "pandas feature column scan",
    },
    // PyTorch / TF Dataset: loaded from CSV/parquet with column names
    {
        re: /pd\.read_(?:csv|parquet|feather)\s*\([^)]+\).*?(?:\[["'`](\w+)["'`]\])/gi,
        confidence: "medium",
        label: "torch.dataset_column",
        provenance: "dataset column scan",
    },
    // Hugging Face datasets: dataset["column"] or dataset.select_columns(["col"])
    {
        re: /\.select_columns\s*\(\s*\[([^\]]+)\]/gi,
        confidence: "high",
        label: "hf.select_columns",
        provenance: "Hugging Face column selection scan",
    },
    {
        re: /dataset\s*\[\s*["'`](\w+)["'`]\s*\]/gi,
        confidence: "medium",
        label: "hf.dataset_column",
        provenance: "Hugging Face dataset access scan",
    },
    // Feast / Tecton feature store: Feature(name="col") or feature_view columns
    {
        re: /Feature\s*\(\s*name\s*=\s*["'`](\w+)["'`]/gi,
        confidence: "high",
        label: "feast.Feature",
        provenance: "feature store definition scan",
    },
    {
        re: /Field\s*\(\s*name\s*=\s*["'`](\w+)["'`]/gi,
        confidence: "high",
        label: "feast.Field",
        provenance: "feature store field scan",
    },
    // MLflow: mlflow.log_param / log_metric with column names as keys
    {
        re: /mlflow\.log_(?:param|metric)\s*\(\s*["'`](\w+)["'`]/gi,
        confidence: "low",
        label: "mlflow.log",
        provenance: "MLflow logging scan",
    },
    // TensorFlow/Keras: feature_columns.numeric_column / categorical_column
    {
        re: /feature_columns?\.\w+_column\s*\(\s*["'`](\w+)["'`]/gi,
        confidence: "high",
        label: "tf.feature_column",
        provenance: "TensorFlow feature column scan",
    },
    // LightGBM / XGBoost: feature_name parameter
    {
        re: /feature_name\s*=\s*\[([^\]]+)\]/gi,
        confidence: "high",
        label: "lgbm.feature_name",
        provenance: "gradient boosting feature list scan",
    },
    // Pandas: groupby(["col"]) / sort_values(["col"]) / merge(on="col")
    {
        re: /\.(?:groupby|sort_values|merge)\s*\(\s*(?:on\s*=\s*)?\[?["'`](\w+)["'`]/gi,
        confidence: "medium",
        label: "pandas.groupby_merge",
        provenance: "pandas dataframe operation scan",
    },
    // dbt / SQL models referenced in Python: ref("model_name") or source("schema", "table")
    {
        re: /\bref\s*\(\s*["'`](\w+)["'`]\s*\)/gi,
        confidence: "high",
        label: "dbt.ref",
        provenance: "dbt ref() call scan",
    },
    {
        re: /\bsource\s*\(\s*["'`]\w+["'`]\s*,\s*["'`](\w+)["'`]\s*\)/gi,
        confidence: "high",
        label: "dbt.source",
        provenance: "dbt source() call scan",
    },
];
const QUOTED_NAMES_RE = /["'`](\w+)["'`]/g;
const SHORT_IGNORE = new Set(["X", "y", "df", "data", "label", "target", "id", "val"]);
export function scanMlFile(content, filePath) {
    const deps = [];
    const language = filePath.endsWith(".py") ? "python" : "typescript";
    for (const { re, confidence, label, provenance } of PATTERNS) {
        re.lastIndex = 0;
        for (const match of content.matchAll(re)) {
            const line = getLineNumber(content, match.index ?? 0);
            const captured = match[1] ?? "";
            const names = extractNames(captured, label);
            for (const name of names) {
                if (!name || name.length < 2 || SHORT_IGNORE.has(name))
                    continue;
                deps.push({
                    type: "dependency",
                    filePath,
                    line,
                    pattern: label,
                    provenance,
                    evidenceType: label === "dbt.ref" || label === "dbt.source" ? "verified" : "heuristic",
                    referencedTable: name,
                    confidence,
                    language,
                });
            }
        }
    }
    return dedup(deps);
}
function extractNames(captured, label) {
    const names = new Set();
    // For list-style captures like '"col1", "col2"'
    if (captured.includes(",") || captured.includes('"') || captured.includes("'")) {
        for (const m of captured.matchAll(QUOTED_NAMES_RE)) {
            names.add(m[1]);
        }
    }
    if (captured.trim() && !captured.includes('"') && !captured.includes("'")) {
        names.add(captured.trim());
    }
    return Array.from(names);
}
function getLineNumber(content, index) {
    return content.slice(0, index).split("\n").length;
}
function dedup(deps) {
    const seen = new Set();
    return deps.filter((d) => {
        const key = `${d.filePath}:${d.line}:${d.referencedTable}:${d.pattern}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
//# sourceMappingURL=ml-scanner.js.map