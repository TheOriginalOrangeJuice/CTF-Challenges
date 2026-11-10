Challenge Name: WildTack Dashboard
Category: Web
Difficulty: Easy

Environment Setup:
1. Build the Docker container:
   docker build -t wildtrack .

2. Run the Docker container:
   docker run --rm -p 5001:5001 wildtrack

3. Access the challenge locally at:
   http://localhost:5001/dashboard 


#### Vulnerability Analysis
The application suffers from an **Insecure Direct Object Reference (IDOR)** vulnerability due to **Broken Object Level Authorization**. The backend trusts user input via the URL route and fails to validate whether the current user should have access to restricted IDs.

#### Exploitation Steps
1. **Locate a public record:** Click on any of the **11 public animal icons** displayed on the public sighting layer or dashboard.
2. **Analyze the URL:** Notice the URL structure navigates to a specific resource ID, for example: `http://localhost:5001/animal/3`.
3. **Manipulate the parameter:** Change the numeric ID at the end of the URL specifically to **`12`** (`http://localhost:5001/animal/12`). 
4. **Retrieve the flag:** Because the backend does not validate object access, forcing ID `12` bypasses the dashboard filters and exposes the hidden endangered animal record containing the flag.
