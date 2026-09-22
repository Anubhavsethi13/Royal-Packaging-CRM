import assert from "node:assert/strict";
import test from "node:test";
import { buildPageMeta } from "@royal-packaging/contracts";
import {
  InvalidPaginationError,
  pageItems,
  parsePagination,
  sortByKey,
  sortDirection
} from "../apps/api/src/utils/http-utils.js";

// ============================================================================
// 1. CANONICAL PAGE META CALCULATION & EMPTY LIST METADATA (Section 6, 11, 12)
// ============================================================================

test("buildPageMeta: first page with multiple pages", () => {
  const meta = buildPageMeta(1, 20, 100);
  assert.equal(meta.page, 1);
  assert.equal(meta.pageSize, 20);
  assert.equal(meta.total, 100);
  assert.equal(meta.totalPages, 5);
  assert.equal(meta.hasNext, true);
  assert.equal(meta.hasPrevious, false);
});

test("buildPageMeta: middle page has both previous and next", () => {
  const meta = buildPageMeta(3, 20, 100);
  assert.equal(meta.page, 3);
  assert.equal(meta.pageSize, 20);
  assert.equal(meta.total, 100);
  assert.equal(meta.totalPages, 5);
  assert.equal(meta.hasNext, true);
  assert.equal(meta.hasPrevious, true);
});

test("buildPageMeta: last page has previous but no next", () => {
  const meta = buildPageMeta(5, 20, 100);
  assert.equal(meta.page, 5);
  assert.equal(meta.pageSize, 20);
  assert.equal(meta.total, 100);
  assert.equal(meta.totalPages, 5);
  assert.equal(meta.hasNext, false);
  assert.equal(meta.hasPrevious, true);
});

test("buildPageMeta: empty collection returns total=0, totalPages=0, hasNext=false, hasPrevious=false (Docs/api/pagination.md)", () => {
  const meta = buildPageMeta(1, 25, 0);
  assert.equal(meta.page, 1);
  assert.equal(meta.pageSize, 25);
  assert.equal(meta.total, 0);
  assert.equal(meta.totalPages, 0);
  assert.equal(meta.hasNext, false);
  assert.equal(meta.hasPrevious, false);
});

test("buildPageMeta: single page result set", () => {
  const meta = buildPageMeta(1, 25, 5);
  assert.equal(meta.page, 1);
  assert.equal(meta.pageSize, 25);
  assert.equal(meta.total, 5);
  assert.equal(meta.totalPages, 1);
  assert.equal(meta.hasNext, false);
  assert.equal(meta.hasPrevious, false);
});

// ============================================================================
// 2. PARSE PAGINATION PARAMETERS & ERROR HANDLING (Section 19)
// ============================================================================

test("parsePagination: defaults to page=1, pageSize=25, offset=0", () => {
  const query = new URLSearchParams();
  const result = parsePagination(query);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 25);
  assert.equal(result.offset, 0);
});

test("parsePagination: parses custom page and pageSize", () => {
  const query = new URLSearchParams("page=2&pageSize=10");
  const result = parsePagination(query);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 10);
  assert.equal(result.offset, 10);
});

test("parsePagination: accepts snake_case page_size parameter", () => {
  const query = new URLSearchParams("page=3&page_size=15");
  const result = parsePagination(query);
  assert.equal(result.page, 3);
  assert.equal(result.pageSize, 15);
  assert.equal(result.offset, 30);
});

test("parsePagination: caps pageSize at maximum (200)", () => {
  const query = new URLSearchParams("page=1&pageSize=999");
  const result = parsePagination(query);
  assert.equal(result.pageSize, 200);
});

test("parsePagination: throws InvalidPaginationError on page=0", () => {
  const query = new URLSearchParams("page=0&pageSize=20");
  assert.throws(
    () => parsePagination(query),
    (err: unknown) => {
      assert.ok(err instanceof InvalidPaginationError);
      assert.equal(err.details[0]?.field, "page");
      assert.equal(err.details[0]?.code, "invalid");
      return true;
    }
  );
});

test("parsePagination: throws InvalidPaginationError on page=-1", () => {
  const query = new URLSearchParams("page=-1");
  assert.throws(
    () => parsePagination(query),
    (err: unknown) => {
      assert.ok(err instanceof InvalidPaginationError);
      assert.equal(err.details[0]?.field, "page");
      return true;
    }
  );
});

test("parsePagination: throws InvalidPaginationError on invalid non-numeric page", () => {
  const query = new URLSearchParams("page=abc");
  assert.throws(
    () => parsePagination(query),
    (err: unknown) => {
      assert.ok(err instanceof InvalidPaginationError);
      assert.equal(err.details[0]?.field, "page");
      return true;
    }
  );
});

test("parsePagination: throws InvalidPaginationError on pageSize=0", () => {
  const query = new URLSearchParams("page=1&pageSize=0");
  assert.throws(
    () => parsePagination(query),
    (err: unknown) => {
      assert.ok(err instanceof InvalidPaginationError);
      assert.equal(err.details[0]?.field, "pageSize");
      return true;
    }
  );
});

test("parsePagination: throws InvalidPaginationError on pageSize < 0", () => {
  const query = new URLSearchParams("page=1&pageSize=-10");
  assert.throws(
    () => parsePagination(query),
    (err: unknown) => {
      assert.ok(err instanceof InvalidPaginationError);
      assert.equal(err.details[0]?.field, "pageSize");
      return true;
    }
  );
});

test("parsePagination: collects multiple errors when both page and pageSize are invalid", () => {
  const query = new URLSearchParams("page=0&pageSize=0");
  assert.throws(
    () => parsePagination(query),
    (err: unknown) => {
      assert.ok(err instanceof InvalidPaginationError);
      assert.equal(err.details.length, 2);
      assert.equal(err.details[0]?.field, "page");
      assert.equal(err.details[1]?.field, "pageSize");
      return true;
    }
  );
});

// ============================================================================
// 3. SORTING UTILITIES & DIRECTION (Section 8)
// ============================================================================

test("sortDirection: parses camelCase and snake_case direction", () => {
  assert.equal(sortDirection(new URLSearchParams("sortDirection=asc")), "asc");
  assert.equal(sortDirection(new URLSearchParams("sortDirection=desc")), "desc");
  assert.equal(sortDirection(new URLSearchParams("sort_direction=asc")), "asc");
  assert.equal(sortDirection(new URLSearchParams("sort_direction=desc")), "desc");
  assert.equal(sortDirection(new URLSearchParams(), "desc"), "desc");
  assert.equal(sortDirection(new URLSearchParams(), "asc"), "asc");
});

test("sortByKey: sorts items deterministically ascending and descending", () => {
  const items = [
    { id: "1", name: "Banana", score: 20 },
    { id: "2", name: "Apple", score: 50 },
    { id: "3", name: "Cherry", score: 10 }
  ];

  const sortedAsc = sortByKey(items, "name", "asc");
  assert.deepEqual(sortedAsc.map((i) => i.name), ["Apple", "Banana", "Cherry"]);

  const sortedDesc = sortByKey(items, "name", "desc");
  assert.deepEqual(sortedDesc.map((i) => i.name), ["Cherry", "Banana", "Apple"]);
});

test("sortByKey: returns clone when sort key is undefined", () => {
  const items = [{ id: "1" }, { id: "2" }];
  const result = sortByKey(items, undefined, "asc");
  assert.deepEqual(result, items);
  assert.notEqual(result, items);
});

// ============================================================================
// 4. PAGE ITEMS SLICING
// ============================================================================

test("pageItems: correctly slices elements based on offset and pageSize", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const page1 = pageItems(items, { page: 1, pageSize: 3, offset: 0 });
  assert.deepEqual(page1, [1, 2, 3]);

  const page2 = pageItems(items, { page: 2, pageSize: 3, offset: 3 });
  assert.deepEqual(page2, [4, 5, 6]);

  const page4 = pageItems(items, { page: 4, pageSize: 3, offset: 9 });
  assert.deepEqual(page4, [10]);

  const outOfBounds = pageItems(items, { page: 5, pageSize: 3, offset: 12 });
  assert.deepEqual(outOfBounds, []);
});
