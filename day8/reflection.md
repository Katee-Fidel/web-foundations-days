# Day 8 reflection

The most difficult concept for me was understanding how APIs and system design fit together. It is easy to describe a button sending a request, but harder to explain what happens when many users send requests at once, a server fails, or the same request is repeated. Working through QuickNotes and TicketHub helped me connect the browser, API endpoints, database, cache, and background workers into one request flow.

I approached this by breaking each operation into small steps: validate the input, identify the user, read or update the right data, and return a clear response. Comparing GET, POST, and DELETE also helped me understand why status codes, error handling, and loading states matter. TicketHub pushed this further by showing why a seat displayed as available is not guaranteed until the database confirms the hold.

I have not included specific capstone feedback because it has not been provided here. My own improvement priority would be to make the QuickNotes architecture easier to explain during a presentation, especially the difference between the JSONPlaceholder demonstration and the proposed real backend. I would also improve testing of retries, failed requests, and reading data immediately after a write. I would use the actual feedback to refine these priorities.

Next, I want to learn how to build a real API connected to PostgreSQL, add authentication, and test transactions with concurrent requests. This would let me turn the design documents into a working service and check whether my design decisions behave as expected.
