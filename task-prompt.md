(Understand the codebase deeply and carefully, write production code make sure no errors comes, write solid reliable code) (my current working dir is gptloop and frontend-main dir, the backend dir is secondary and the main backend is gptloop, and the main frontend is frontend-main, only write changes on gptloop dir and on frontend-main dir) (on commit please don't add your references, instead add me as co author, user name = "maxrionloop", email = "opengptloop@gmail.com") (After task done verify your work only end to end) 

Add new multi agent system:
- add a new agent his role is ceo, this agent is able to control the head and leaders of the agent teams, imagine an environment whare multiple agent teams are working and an single agent controling all the agent teams, this single agent call the team leaders and give them task, then the team leaders give task to team members
- this agent automatically take the right team (Or give task to multiple teams) and give task to them

Add ceo option in multi agent team creation page

When user click the users enter the name of the ceo, and a short description, and a system prompt, then user select the available multi agent teams (user can select the multi agent teams) then user click save to save it

- this agent use the same sqlite database
- note: write code according to my codebase
- make sure you have tested all the things correctly, you can create test files for testing it properly

- make runtime for this agent in agents
multiagent folder = ceo
- in this folder create the comprehensive runtime for this agent
- user have option in settings for activating this agent system like the multi agent team
- user can create multiple ceo agents, and have options in multi agent page for activeting, just like multi agent team 
- note3: in this mode the first user prompt go to the ceo agent
- note4: this agent use the same multi agent runtime

ADD 3 TOOLS

- 1 new tool for the team leader agent
Tool scheme:
{
  "name": "report_task_completion_to_ceo",
  "description": "Report to the CEO Agent that the assigned task has been completed. Provide a concise summary of the completed work and its result.",
  "input_schema": {
    "type": "object",
    "properties": {
      "summary": {
        "type": "string",
        "description": "A concise summary of the completed task and its result."
      }
    },
    "required": ["summary"],
    "additionalProperties": false
  }
}
Tool:
- This tool is for the agent team head leader
- only active when the user in this multi agent mode, if user is not in ceo multi agent mode then the team leader don't see this tool and don't see the usage instructions for this tool
- handling: imagine what if multiple team leaders send the summary to ceo, that the task is complete, and the ceo agent is bussy on other things, then what
Ans: the request go to queue system so when agent complete running then the summery automatically go to the ceo agent, just like the normal multi agent system (note: if multiple queue, then send all of those queue at once, so no need to wait for each queue, just like the normal multi agent system)



- 2 tools for ceo agent
Tool scheme:
{
  "name": "assign_tasks_to_teams",
  "description": "Assign tasks to multiple teams in a single operation. Each task is assigned to a specific team leader or head responsible for that team.",
  "input_schema": {
    "type": "object",
    "properties": {
      "tasks": {
        "type": "array",
        "description": "A list of prompts to assign to teams.",
        "items": {
          "type": "object",
          "properties": {
            "team_leader": {
              "type": "string",
              "description": "The name or ID of the Team Leader or Head responsible for the team."
            },
            "prompt": {
              "type": "string",
              "description": "The prompt or instructions to assign to the team."
            }
          },
          "required": ["team_leader", "prompt"],
          "additionalProperties": false
        }
      }
    },
    "required": ["tasks"],
    "additionalProperties": false
  }
}
Tool:
- By using this tool llm can able to give and send task to a team leader, or ceo agent can send to multiple team leaders
- when the ceo give task an prompt with the task appand = "this task is by ceo, after completing task by your team members, report to ceo" (This is example prompt, make this good for the batter understanding.) 
- if the ceo agent call the same team leader again, then make sure the team leader context remains, like the normal multi agent system

example tool call:
{
  "tasks": [
    {
      "team_leader": "frontend_team_leader",
      "prompt": "Build the new dashboard UI and make it responsive."
    },
    {
      "team_leader": "backend_team_leader",
      "prompt": "Implement the dashboard API and required database operations."
    },
    {
      "team_leader": "testing_team_leader",
      "prompt": "Create and run tests for the new dashboard features."
    }
  ]
}

Tool schema:
{
  "name": "list_teams",
  "description": "List all existing agent teams.",
  "input_schema": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  }
}
Tool:
- this tool is only for ceo agent
- this tool list all the available teams, that user selected on ceo agent creation
- this tool list the, team name, team leaders an the team members with their description

Example tool response:
{
  "teams": [
    {
      "team_name": "Frontend Team",
      "team_leader": "frontend_leader",
      "members": [
        {
          "name": "ui_agent",
          "description": "Designs and builds user interfaces."
        },
        {
          "name": "react_agent",
          "description": "Develops React components and features."
        }
      ]
    },
    {
      "team_name": "Backend Team",
      "team_leader": "backend_leader",
      "members": [
        {
          "name": "api_agent",
          "description": "Builds and maintains APIs."
        },
        {
          "name": "database_agent",
          "description": "Manages database operations."
        }
      ]
    },
    {
      "team_name": "DevOps Team",
      "team_leader": "devops_leader",
      "members": [
        {
          "name": "deployment_agent",
          "description": "Handles application deployment."
        },
        {
          "name": "infrastructure_agent",
          "description": "Manages infrastructure and environments."
        }
      ]
    },
    {
      "team_name": "QA Team",
      "team_leader": "qa_leader",
      "members": [
        {
          "name": "testing_agent",
          "description": "Creates and runs automated tests."
        },
        {
          "name": "review_agent",
          "description": "Reviews code quality and identifies issues."
        }
      ]
    }
  ]
}


TOOL REGISTRATION
- Add this 3 tools to the agent tools registry.
- Ensure it follows the same structure as existing tools.
- Ensure it is available for LLM tool selection alongside existing tools.
- Use ONLY native tool calling (e.g. OpenAI tools / function calling)
- DO NOT return tool calls as text
- DO NOT wrap tool calls in markdown or JSON manually
- DO NOT simulate tool usage
- Tool call MUST come from LLM API response (`tool_calls` / `function_call`)
- create the tools files in tools folder
- create the tools test files in tools folder
