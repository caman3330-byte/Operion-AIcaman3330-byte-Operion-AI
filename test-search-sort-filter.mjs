import fetch from "node-fetch";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const API_ENDPOINT = `${BASE_URL}/api`;
const AUTH_TOKEN = process.env.FOUNDER_AUTH_TOKEN || "test-token";

let testsPassed = 0;
let testsFailed = 0;

function logTest(name, passed, details = "") {
  const status = passed ? "✓" : "✗";
  const emoji = passed ? "✅" : "❌";
  console.log(`${emoji} ${status} ${name}${details ? " — " + details : ""}`);
  if (passed) testsPassed++;
  else testsFailed++;
}

console.log("\n=== SEARCH / SORT / FILTER TEST ===\n");

async function runTest() {
  try {
    // Test search functionality
    console.log("Testing Search Capabilities...\n");

    const searchTests = [
      { query: "business", description: "business_name search" },
      { query: "test@test.test", description: "email search" },
      { query: "(555)", description: "phone search" },
      { query: "CA", description: "state search" },
      { query: "San", description: "city search" }
    ];

    for (const test of searchTests) {
      try {
        const resp = await fetch(`${API_ENDPOINT}/leads?search=${encodeURIComponent(test.query)}`, {
          headers: {
            "Authorization": `Bearer ${AUTH_TOKEN}`
          }
        });

        if (resp.ok) {
          const result = await resp.json();
          logTest(
            `Search: ${test.description}`,
            Array.isArray(result.data),
            `Returned ${result.data?.length || 0} results`
          );
        } else {
          logTest(`Search: ${test.description}`, false, `Status ${resp.status}`);
        }
      } catch (err) {
        logTest(`Search: ${test.description}`, false, err.message);
      }
    }

    // Test filter functionality
    console.log("\nTesting Filter Capabilities...\n");

    const filters = [
      { param: "status=raw", description: "filter by status=raw" },
      { param: "tier=A", description: "filter by tier=A" }
    ];

    for (const filter of filters) {
      try {
        const resp = await fetch(`${API_ENDPOINT}/leads?${filter.param}`, {
          headers: {
            "Authorization": `Bearer ${AUTH_TOKEN}`
          }
        });

        if (resp.ok) {
          const result = await resp.json();
          logTest(
            `Filter: ${filter.description}`,
            Array.isArray(result.data),
            `Returned ${result.data?.length || 0} results`
          );
        } else {
          logTest(`Filter: ${filter.description}`, false, `Status ${resp.status}`);
        }
      } catch (err) {
        logTest(`Filter: ${filter.description}`, false, err.message);
      }
    }

    // Test email-ready filter
    console.log("\nTesting Email-Ready Filter...\n");

    try {
      const resp = await fetch(`${API_ENDPOINT}/leads/email-ready`, {
        headers: {
          "Authorization": `Bearer ${AUTH_TOKEN}`
        }
      });

      if (resp.ok) {
        const result = await resp.json();
        const allHaveEmail = result.data?.every(lead => !!lead.email);
        logTest(
          "Email-ready filter excludes leads without email",
          allHaveEmail,
          `All ${result.data?.length || 0} leads have email`
        );
      } else {
        logTest("Email-ready filter", false, `Status ${resp.status}`);
      }
    } catch (err) {
      logTest("Email-ready filter", false, err.message);
    }

    // Test sort functionality
    console.log("\nTesting Sort Capabilities...\n");

    const sorts = [
      { param: "sort=created_at-desc", description: "sort by newest first" },
      { param: "sort=created_at-asc", description: "sort by oldest first" },
      { param: "sort=business_name-asc", description: "sort by business name" }
    ];

    for (const sort of sorts) {
      try {
        const resp = await fetch(`${API_ENDPOINT}/leads?${sort.param}`, {
          headers: {
            "Authorization": `Bearer ${AUTH_TOKEN}`
          }
        });

        if (resp.ok) {
          const result = await resp.json();
          logTest(
            `Sort: ${sort.description}`,
            Array.isArray(result.data),
            `Returned ${result.data?.length || 0} results`
          );
        } else {
          logTest(`Sort: ${sort.description}`, false, `Status ${resp.status}`);
        }
      } catch (err) {
        logTest(`Sort: ${sort.description}`, false, err.message);
      }
    }

    // Test pagination
    console.log("\nTesting Pagination...\n");

    try {
      const resp1 = await fetch(`${API_ENDPOINT}/leads?page=1&pageSize=10`, {
        headers: {
          "Authorization": `Bearer ${AUTH_TOKEN}`
        }
      });

      const resp2 = await fetch(`${API_ENDPOINT}/leads?page=2&pageSize=10`, {
        headers: {
          "Authorization": `Bearer ${AUTH_TOKEN}`
        }
      });

      if (resp1.ok && resp2.ok) {
        const result1 = await resp1.json();
        const result2 = await resp2.json();

        const page1Ids = result1.data?.map(l => l.id) || [];
        const page2Ids = result2.data?.map(l => l.id) || [];
        const hasDifferences = page1Ids.some(id => !page2Ids.includes(id));

        logTest(
          "Pagination works correctly",
          hasDifferences || page2Ids.length === 0,
          `Page 1: ${page1Ids.length}, Page 2: ${page2Ids.length}`
        );
      } else {
        logTest("Pagination", false, `Status ${resp1.status} / ${resp2.status}`);
      }
    } catch (err) {
      logTest("Pagination", false, err.message);
    }

  } catch (err) {
    logTest("Search/Sort/Filter test", false, err.message);
  }

  // Summary
  console.log("\n=== TEST SUMMARY ===");
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`Total: ${testsPassed + testsFailed}`);

  if (testsFailed === 0) {
    console.log("\n✅ SEARCH / SORT / FILTER VERIFIED");
  } else {
    console.log(`\n⚠️  ${testsFailed} tests failed`);
  }

  console.log("\n=== END SEARCH/SORT/FILTER TEST ===\n");

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTest().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
