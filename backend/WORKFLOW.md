# Collection approval workflow

The existing route and route-stop models represent bin collection tasks. Bins at
Fill above 95% qualifies; maintenance bins and bins on another open route do not.
Admins create routes and assign an active driver (or save an unassigned plan).
Only the assigned driver can submit stops through the existing `/collect` endpoint.
`collected_at` records driver submission; the route stays `in_progress` until review.
Once every stop is submitted, an admin calls `POST /routes/{id}/approve`.
This completes the route and sets its bins to zero fill in one transaction.
Maintenance status is preserved. General bin edits cannot change fill levels.

New resident pickup requests include a destination bin and positive waste volume
in litres. Creating or submitting a request does not change actual bin contents.
The existing `/complete` action changes `accepted` to `submitted`; only an admin
can call `POST /pickup-requests/{id}/approve` to mark the delivery `completed` and
increase the destination fill by `volume / capacity * 100`. These changes commit
in one transaction. Approval locks and refreshes the bin so concurrent deliveries
cannot overwrite one another. Repeated approval is rejected.

Above 95%, delivery approval automatically creates one unassigned planned collection
route for that bin, unless it already has an open route. The admin assigns a driver
from the Routes screen. This driver submits the collection and the admin approves
emptying as described above. Requests exceeding the bin's remaining capacity cannot
be approved until space is available; waste is never silently discarded or capped.
Maintenance bins cannot receive approved deliveries. Residents can edit their own requests until completion approval; completed and
cancelled requests are locked. Editing accepted or submitted work returns it to
assigned status, preserving its driver and requiring driver confirmation again.
Edits do not change bin contents. An unchanged past pickup date may be retained. Capacity changes require an empty bin.

## Existing database deployment

For PostgreSQL, run `migrations/001_pickup_submitted.sql` against the application
database, then run `migrations/002_request_destination_bins.sql`, before starting
the updated API. `create_all` does not update existing
enum types. No existing completion history is rewritten. Existing completed
routes/requests are treated as historical completed records.
Historical requests have null destination/volume and do not increase any bin's
fill. Existing fill percentages are preserved; bins below 100% are marked active
unless under maintenance.

Route and request transitions use row locks. Route assignment locks bins in ID
order before checking other open assignments. Production concurrency relies on
PostgreSQL row locking; SQLite unit tests do not validate concurrent locking.

## Validation

From `backend`, with dependencies available in the selected Python environment:

    python -B -m unittest discover -s tests -v

Tests use isolated in-memory SQLite databases and never import application startup
or connect to the application database. They cover ownership, role restrictions,
eligibility, duplicate tasks, approval order, and transaction rollback.

From `frontend`:

    npm run build
