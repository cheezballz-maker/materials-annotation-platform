# Local Patent Annotation Workbench

Self-contained local annotation app for patent formulation extraction review. The workflow is modeled after established annotation tools such as Doccano and Label Studio: open a project/workspace, select a document task, annotate spans, manage nodes in a sidebar, draw relations, then export.

The app is local-only. It reads and writes files on the machine running the FastAPI backend.

## Workflow Model

1. Open a working folder from the landing page.
2. The folder should contain raw patent text files such as:

```text
1. WO2010119313A1.md
2. US20160082038A1.md
```

3. Annotation companion files live beside the raw files:

```text
1. WO2010119313A1_partially_annotated.json
1. WO2010119313A1_annotated.json
```

4. Select a raw patent file from the file queue.
5. Highlight text in the source panel to create a node.
6. Use the right panel tabs for:

- `Substances`
- `Compositions`
- `Properties`
- `Measurements`
- `Graph`

7. Click an existing node to jump the left panel to its evidence span.
8. Click `Edit` only when you intend to change node fields.
9. Open the `Graph` tab to draw relationships by clicking a source node, then a target node.
10. Save partial work or mark the document complete.

## Annotation Fields

Substance:

- `substance_name`
- `substance_type`
- `manufacturer`
- `physical_form`

Composition:

- `composition_name`
- `composition_type`
- `physical_form`
- `constituent_status`
- `amount_comparator`
- `amount_value`
- `amount_lower_value`
- `amount_upper_value`
- `amount_unit`
- `function`

Property:

- `property_name`
- `property_type`
- `target_ref`

Measurement:

- `measurement_type`
- `value`
- `comparator`
- `unit`
- `lower_value`
- `upper_value`
- `measurement_conditions.condition_name`
- `measurement_conditions.condition_value`
- `measurement_conditions.condition_unit`

Relationship references such as `constituent_ref`, `target_ref`, and `property_ref` are maintained internally by the graph interface because the schema needs them.

## Supported Graph Links

The graph tab supports these directed links:

- Substance -> Composition: adds a composition constituent.
- Composition -> Composition: adds a nested composition constituent.
- Substance -> Property: adds a property target.
- Composition -> Property: adds a property target.
- Property -> Measurement: sets the measurement property reference.

## Run Locally

Start the backend:

```powershell
cd "C:\Users\IT PatsnapSG\OneDrive - Patsnap\13. PatSnap\10. Testing & Evaluation\4. Annotation Platform"
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --port 8000
```

For frontend development, start Vite in a second PowerShell window:

```powershell
cd "C:\Users\IT PatsnapSG\OneDrive - Patsnap\13. PatSnap\10. Testing & Evaluation\4. Annotation Platform\frontend"
npm.cmd run dev
```

Then open:

```text
http://127.0.0.1:5173
```

For routine local use, build the frontend once:

```powershell
cd "C:\Users\IT PatsnapSG\OneDrive - Patsnap\13. PatSnap\10. Testing & Evaluation\4. Annotation Platform\frontend"
npm.cmd run build
```

Then run only the backend and open:

```text
http://127.0.0.1:8000
```

## Cloud POC Deployment

The fastest low-risk cloud path is to deploy the existing FastAPI app as one Docker service and mount a small persistent volume for the annotation workspace. Local folder mode still works when no cloud workspace environment variable is set.

Recommended Railway setup:

1. Create a Railway project from this repository.
2. Add a persistent volume and mount it at:

```text
/data
```

3. Set these environment variables:

```text
ANNOTATION_WORKSPACE_PATH=/data/workspace
ANNOTATION_APP_USERNAME=annotator
ANNOTATION_APP_PASSWORD=<choose-an-internal-password>
```

4. Deploy with the included `Dockerfile`.
5. On first startup, the Docker image seeds `/data/workspace` from the repository's `seed-workspace` folder without overwriting files that already exist in the volume.

In cloud mode, the backend uses `ANNOTATION_WORKSPACE_PATH` as the fixed workspace and ignores browser folder-picking requests. This avoids exposing arbitrary server paths online.

Set `ANNOTATION_SEED_WORKSPACE=0` if you do not want the deployed image to copy the bundled sample/current files into the mounted workspace. After the first deployment, keep the Railway volume attached so annotations survive restarts and redeploys.

For a very small internal POC, `ANNOTATION_APP_PASSWORD` enables browser HTTP Basic authentication. Use HTTPS from the hosting provider, and share the password only with intended annotators. Leave the password unset for local unauthenticated development.

Saves include a lightweight revision check. If two people open the same document and one saves after the other, the second person will be asked to refresh before saving instead of silently overwriting the newer annotation.

## File Behavior

- Raw files can be `.md`, `.markdown`, `.txt`, or `.json`.
- `.txt` and `.json` files may be plain text, JSON with a `markdown` field, or structured patent JSON with `title`, `abstract`, `description`, and `claims` fields.
- `_partially_annotated.json` is used for draft/incomplete work.
- `_annotated.json` is used when status is `Completed`.
- Export writes `<raw_file_stem>.schema.json` beside the raw file.

## References

- Doccano: project setup, import, labeling, and export workflow.
- Label Studio: span-first relation extraction workflow where text spans are labeled and then connected with relations.
