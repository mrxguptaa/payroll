import Employee from "../models/Employee.js";

import Attendance from "../models/AttendanceSchema.js";

const generateEmpCode = async (org, empType, doj) => {
  let prefix = "";
  let start = 0;
  let end = 0;

  // Define ranges based on organization and type
  switch (org) {
    case "Mittal Spinners":
      prefix = "";
      start = empType === "Staff" ? 1 : 101;
      end = empType === "Staff" ? 100 : 300;
      break;
    case "HRM Spinners":
      prefix = "";
      start = empType === "Staff" ? 301 : 401;
      end = empType === "Staff" ? 400 : 600;
      break;
    case "Jai Durga Cottex":
      prefix = "JDC-";
      start = empType === "Staff" ? 1 : 101;
      end = empType === "Staff" ? 100 : 200;
      break;
    default:
      throw new Error("Invalid organization");
  }

  // Fetch all employees for the given organization and type
  const employees = await Employee.find({ org, empType }).select(
    "empCode doj dol"
  );

  // Find reusable codes where the `dol` is before the new employee's `doj`
  const reusableCodes = employees
    .filter(
      (e) =>
        e.dol && // Employee has a date of leaving
        new Date(e.dol) < new Date(doj) // Left before the new employee's joining date
    )
    .map((e) => {
      const match = e.empCode.match(/\d+$/); // Extract numeric part of empCode
      return match ? parseInt(match[0], 10) : null;
    })
    .filter((code) => code !== null && code >= start && code <= end);

  // Check if these reusable codes are free from overlap
  const overlappingCodes = employees
    .filter(
      (e) =>
        !e.dol || // Employee is currently active
        (new Date(e.doj) <= new Date(doj) && new Date(e.dol) >= new Date(doj)) // Employment period overlaps with the new employee's joining date
    )
    .map((e) => {
      const match = e.empCode.match(/\d+$/); // Extract numeric part of empCode
      return match ? parseInt(match[0], 10) : null;
    });

  // Find codes that are reusable and not overlapping
  const availableCodes = reusableCodes.filter(
    (code) => !overlappingCodes.includes(code)
  );

  if (availableCodes.length > 0) {
    return `${prefix}${Math.min(...availableCodes)}`; // Reuse the smallest available code
  }

  // If no reusable codes, find the next available code
  const activeCodes = employees
    .map((e) => {
      const match = e.empCode.match(/\d+$/); // Extract numeric part of empCode
      return match ? parseInt(match[0], 10) : null;
    })
    .filter((code) => code !== null && code >= start && code <= end);

  const sortedActiveCodes = activeCodes.sort((a, b) => a - b);

  for (let i = start; i <= end; i++) {
    if (!sortedActiveCodes.includes(i)) {
      return `${prefix}${i}`; // Return the first available code
    }
  }

  throw new Error("No available codes in the range");
};

export const createEmployee = async (req, res) => {
  try {
    const { name, mobile, doj, dol, empType, org, salaryType, empCode } =
      req.body;
    let { salary } = req.body;
    salary = salary != null ? salary : 0;

    if (dol && new Date(dol) <= new Date(doj)) {
      return res
        .status(400)
        .json({ message: "Date of Leaving must be after Date of Joining." });
    }

    // Generate an appropriate empCode with respect to the joining date
    // const empCode = await generateEmpCode(org, empType, doj);

    // Create a new employee
    const newEmployee = new Employee({
      name,
      mobile,
      doj: new Date(doj),
      dol: dol ? new Date(dol) : null,
      empType,
      org,
      salaryType,
      salary,
      empCode,
    });

    await newEmployee.save();
    res
      .status(201)
      .json({ message: "Employee created successfully.", empCode });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to create employee.", error: error.message });
  }
};

export const getEmployees = async (req, res) => {
  try {
    const { org } = req.query;

    // Initialize query object
    const query = {
      $or: [{ dol: null }, { dol: { $gte: new Date() } }], // Only employees whose dol is null or in the future
    };

    // Add organization filter if provided
    if (org) query.org = org;

    // Fetch employees
    const employees = await Employee.find(query).sort({ empCode: 1 });

    // Return response
    res.status(200).json(employees);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch employees", error: error.message });
  }
};

export const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, mobile, doj, dol, empType, org, salaryType, salary } =
      req.body;

    // Find the employee by ID
    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    // If organization or employee type is changing, delete the old employee and create a new one
    if (
      (org && org !== employee.org) ||
      (empType && empType !== employee.empType)
    ) {
      // Remove associated attendance records
      await Attendance.deleteMany({ employeeId: employee._id });

      // Delete the existing employee
      await Employee.findByIdAndDelete(employee._id); // Use findByIdAndDelete instead of remove

      // Generate a new empCode for the new organization and type
      const newEmpCode = await generateEmpCode(
        org || employee.org,
        empType || employee.empType,
        doj || employee.doj
      );

      // Create a new employee record
      const newEmployee = new Employee({
        name: name || employee.name,
        mobile: mobile || employee.mobile,
        doj: doj ? new Date(doj) : employee.doj,
        dol: dol ? new Date(dol) : null,
        empType: empType || employee.empType,
        org: org || employee.org,
        salaryType: salaryType || employee.salaryType,
        salary: salary != null ? salary : employee.salary,
        empCode: newEmpCode,
      });

      await newEmployee.save();

      return res.status(201).json({
        message: "Employee updated successfully and moved to a new group.",
        newEmployeeId: newEmployee._id,
      });
    }

    // If no organization or employee type change, just update the existing employee
    if (dol && new Date(dol) <= new Date(doj || employee.doj)) {
      return res
        .status(400)
        .json({ message: "Date of Leaving must be after Date of Joining." });
    }

    employee.name = name || employee.name;
    employee.mobile = mobile || employee.mobile;
    employee.doj = doj ? new Date(doj) : employee.doj;
    employee.dol = dol ? new Date(dol) : employee.dol;
    employee.salaryType = salaryType || employee.salaryType;
    employee.salary = salary != null ? salary : employee.salary;

    await employee.save();

    return res.status(200).json({ message: "Employee updated successfully." });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to update employee.", error: error.message });
  }
};

export const deleteEmployee = async (req, res) => {
  const { id } = req.params;

  try {
    const employee = await Employee.findById(id);

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    if (employee.isDeleted) {
      return res.status(400).json({ message: "Employee is already deleted." });
    }

    employee.isDeleted = true;

    await employee.save();

    res.status(200).json({ message: "Employee deleted successfully." });
  } catch (error) {
    console.error("Error deleting employee:", error);
    res
      .status(500)
      .json({ message: "Failed to delete employee.", error: error.message });
  }
};

export const getEmployeeChart = async (req, res) => {
  try {
    const { org } = req.query;

    if (!org) {
      return res.status(400).json({ message: "Organization is required." });
    }

    const employees = await Employee.find({
      org,
      $or: [{ dol: null }, { dol: { $gte: new Date() } }],
    }).sort({ empCode: 1 });

    const chart = [];
    const ranges = {
      "Mittal Spinners": { staff: [1, 100], labor: [101, 300] },
      "HRM Spinners": { staff: [301, 400], labor: [401, 600] },
      "Jai Durga Cottex": {
        staff: [1, 100],
        labor: [101, 200],
        prefix: "JDC-",
      },
    };

    const range = ranges[org] || {};
    const prefix = range.prefix || "";

    ["staff", "labor"].forEach((type) => {
      const [start, end] = range[type] || [];
      if (!start || !end) {
        console.log(`Invalid range for ${type} in org ${org}`);
        return;
      }

      for (let code = start; code <= end; code++) {
        const fullCode = prefix ? `${prefix}${code}` : `${code}`;
        const employee = employees.find((emp) => emp.empCode === fullCode);
        chart.push({
          code: fullCode,
          name: employee ? employee.name : "",
          type: type === "staff" ? "Staff" : "Labor",
        });
      }
    });

    console.log("chart", chart);

    // Return the generated chart
    res.status(200).json(chart);
  } catch (error) {
    console.error("Error generating employee chart:", error);
    res.status(500).json({ message: "Failed to generate chart.", error });
  }
};

// Controller to get employees with serialized data
export const getSerializedEmployees = async (req, res) => {
  try {
    const { org } = req.query;

    // Fetch employees filtered by organization (if provided)
    const query = {
      $or: [{ dol: null }, { dol: { $gte: new Date() } }], // Only employees whose dol is null or in the future
    };

    // Add organization filter if provided
    if (org) query.org = org;

    const employees = await Employee.find(query).sort({ salary: 1 });

    res.status(200).json(employees);
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ message: "Failed to fetch employees." });
  }
};

// Add this route
// export const getAttendanceEmp = async (req, res) => {
//   console.log(req.query)
//   const { date, org,role} = req.query;

//   try {
//     const query = {
//       isDeleted: false,
//       doj: { $lte: new Date(date) }, // Only employees who joined before the selected date
//     };

//     if (org && org !== "All" && role !== "Super Admin") {
//       query.org = org; // Filter by organization
//     }

//     const filemployees = await Employee.find(query)

//     res.status(200).json({
//       filemployees,
//     });
//   } catch (error) {
//     console.error("Error fetching employees:", error);
//     res.status(500).json({ message: "Failed to fetch employees." });
//   }
// };

//By Shivam
//Get Available Employee Id

export const getAvailableEmpID = async (req, res) => {
  const ranges = {
    "Mittal Spinners": { Staff: [1, 100], Labor: [101, 300] },
    "HRM Spinners": { Staff: [301, 400], Labor: [401, 600] },
    "Jai Durga Cottex": { Staff: [1, 100], Labor: [101, 200], prefix: "JDC-" },
  };

  const orgname = req.query.org;
  const empType = req.query.emptype;
  const date = new Date(Date.now());
  try {
    const data = await Employee.find({
      org: orgname,
      empType,

    }).select("name empCode empType dol");

    
    // const empCodes = data.filter((val)=>{
    //   return val.empCode
    // })
    // return res.json(data)

    
    // console.log("Employees ", employees)
    //Available Employee Codes Array
    let arr = [];

    //Used Employee Codes Array
    const empCodes = data.map((emp) => {
      if(emp.dol>=date){
        return emp.empCode;
      }else if(emp.dol == null){
        return emp.empCode;
      }else{
      }
    });

    console.log(empCodes)

    // console.log(empCodes)

    if (orgname == "HRM Spinners" || orgname == "Mittal Spinners") {
      for (
        let i = ranges[orgname][empType][0];
        i <= ranges[orgname][empType][1];
        i++
      ) {
        if (empCodes.includes(`${i}`)) continue;
        arr.push(`${i}`);
      }

      res.status(200).json({
        message: "Data Fetched",
        arr,
      });
    } else if (orgname === "Jai Durga Cottex") {
      for (
        let i = ranges[orgname][empType][0];
        i <= ranges[orgname][empType][1];
        i++
      ) {
        let test = `JDC-${i}`;
        if (empCodes.includes(test)) continue;
        arr.push(test);
      }

      res.status(200).json({
        message: "Data fetched",
        arr,
      });
    } else {
      res.status(404).json({
        message: "Incorrect Org Name",
      });
    }
  } catch (error) {
    res.status(404).json({
      message: "not found",
      error: error,
    });
  }
};

export const getEmpToAdvanceMark = async (req, res) => {
  try {
    const { org, month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ message: "Month and year are required." });
    }

    // Build the query for employees filtered by organization
    const query = {
      dol: null, // Only employees whose dol is null (currently employed)
    };

    // Add organization filter if provided
    if (org) query.org = org;

    // Fetch employees
    const employees = await Employee.find(query)
      .sort({ doj: 1 })
      .select("name empCode doj advances");

    // Filter advances for the current month and year
    const currentMonthAdvances = employees.map((employee) => {
      const filteredAdvances = (employee.advances || []).filter((advance) => {
        const advanceDate = new Date(advance.date);
        return (
          advanceDate.getMonth() + 1 === parseInt(month) &&
          advanceDate.getFullYear() === parseInt(year)
        );
      });
      return {
        ...employee.toObject(),
        advances: filteredAdvances,
      };
    });

    res.status(200).json(currentMonthAdvances);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch employees." });
  }
};
